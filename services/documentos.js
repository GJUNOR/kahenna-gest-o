"use strict";
const { randomUUID, createHash } = require("node:crypto");
const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = "kahenna-prontuarios";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function falha(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
function validarId(id) { if (!UUID.test(String(id))) throw falha(400, "Identificador inválido."); }
function validarPDF(buffer, nome) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw falha(400, "Selecione um PDF.");
    if (buffer.length > MAX_BYTES) throw falha(413, "O PDF deve ter no máximo 15 MB.");
    if (typeof nome !== "string" || nome.length > 180 || !/\.pdf$/i.test(nome) || /[\x00-\x1f\x7f/\\]/.test(nome)) throw falha(400, "Informe um nome de arquivo PDF válido.");
    if (!buffer.subarray(0, 8).toString("ascii").match(/^%PDF-1\.[0-9]|^%PDF-2\.0/) || !buffer.subarray(-2048).includes(Buffer.from("%%EOF"))) throw falha(400, "O arquivo não parece ser um PDF válido.");
}
function criarServico(supabase) {
    async function paciente(id) {
        validarId(id);
        const { data, error } = await supabase.from("visitantes").select("visitante_id").eq("visitante_id", id).maybeSingle();
        if (error) throw falha(503, "Não foi possível verificar o paciente.");
        if (!data) throw falha(404, "Paciente não encontrado.");
    }
    async function auditar(documento, usuario, acao) {
        const { error } = await supabase.from("documentos_auditoria").insert({ documento_id: documento.id, paciente_id: documento.paciente_id, usuario_id: usuario.id, acao });
        if (error) throw falha(503, "Não foi possível registrar o acesso ao documento.");
    }
    return {
        async listar(pacienteId, usuario) {
            await paciente(pacienteId);
            const { data, error } = await supabase.from("documentos_pacientes").select("id,paciente_id,nome_original,tamanho_bytes,criado_em").eq("paciente_id", pacienteId).order("criado_em", { ascending: false }).limit(1000);
            if (error) throw falha(503, "Documentos indisponíveis. Verifique a configuração do armazenamento.");
            const { error: auditError } = await supabase.from("documentos_auditoria").insert({ paciente_id: pacienteId, usuario_id: usuario.id, acao: "listar" });
            if (auditError) throw falha(503, "Não foi possível registrar a consulta.");
            return data || [];
        },
        async enviar(pacienteId, usuario, buffer, nome) {
            validarPDF(buffer, nome);
            await paciente(pacienteId);
            const { data: bucket, error: bucketError } = await supabase.storage.getBucket(BUCKET);
            if (bucketError || !bucket || bucket.public !== false) throw falha(503, "O armazenamento privado não está configurado.");
            const id = randomUUID();
            const caminho = `${pacienteId}/${id}.pdf`;
            const hash = createHash("sha256").update(buffer).digest("hex");
            const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
            if (uploadError) throw falha(503, "Não foi possível enviar o PDF. Tente novamente.");
            const { data, error } = await supabase.rpc("kahenna_registrar_documento", { p_id: id, p_paciente: pacienteId, p_nome: nome, p_caminho: caminho, p_tamanho: buffer.length, p_hash: hash, p_usuario: usuario.id });
            if (error) {
                const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([caminho]);
                if (cleanupError) console.error("PDF pendente de conciliação:", id);
                throw falha(503, "O PDF não pôde ser registrado. Tente novamente.");
            }
            return Array.isArray(data) ? data[0] : data;
        },
        async baixar(pacienteId, documentoId, usuario) {
            validarId(pacienteId); validarId(documentoId);
            const { data: doc, error } = await supabase.from("documentos_pacientes").select("*").eq("id", documentoId).eq("paciente_id", pacienteId).maybeSingle();
            if (error) throw falha(503, "Documento indisponível.");
            if (!doc) throw falha(404, "Documento não encontrado para este paciente.");
            // Reject a mismatched object path even if metadata were accidentally corrupted.
            if (doc.bucket !== BUCKET || doc.caminho !== `${pacienteId}/${documentoId}.pdf`) throw falha(503, "Referência do documento inválida.");
            if (doc.tamanho_bytes > MAX_BYTES) throw falha(413, "Documento excede o limite permitido.");
            await auditar(doc, usuario, "baixar");
            const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(doc.caminho);
            if (downloadError || !blob) throw falha(503, "Não foi possível recuperar o PDF.");
            const buffer = Buffer.from(await blob.arrayBuffer());
            if (buffer.length !== doc.tamanho_bytes || createHash("sha256").update(buffer).digest("hex") !== doc.sha256) throw falha(503, "Falha na verificação de integridade do PDF.");
            return { buffer, nome: doc.nome_original };
        }
    };
}
module.exports = { criarServico, validarPDF, validarId, MAX_BYTES, BUCKET };
