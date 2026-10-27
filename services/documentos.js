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
function criarServico(supabase, arquivoS3 = require("./arquivoS3").criarArquivoS3()) {
    async function registro(pacienteId, documentoId) {
        validarId(pacienteId); validarId(documentoId);
        const { data, error } = await supabase.from("documentos_pacientes").select("*").eq("id", documentoId).eq("paciente_id", pacienteId).maybeSingle();
        if (error) throw falha(503, "Documento indisponível.");
        if (!data) throw falha(404, "Documento não encontrado para este paciente.");
        if (data.bucket !== BUCKET || data.caminho !== `${pacienteId}/${documentoId}.pdf` || data.tamanho_bytes < 1 || data.tamanho_bytes > MAX_BYTES) throw falha(503, "Referência do documento inválida.");
        return data;
    }
    async function arquivo(documentoId) {
        const { data, error } = await supabase.from("documentos_arquivos").select("*").eq("documento_id", documentoId).maybeSingle();
        if (error) throw falha(503, "Não foi possível verificar o arquivamento. Verifique a migração do banco.");
        return data;
    }
    async function bytesTemporarios(doc) {
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(doc.caminho);
        if (error || !blob) throw falha(503, "Não foi possível recuperar o PDF para conferência.");
        return Buffer.from(await blob.arrayBuffer());
    }
    function conferirBytes(doc, buffer) {
        if (buffer.length !== doc.tamanho_bytes || createHash("sha256").update(buffer).digest("hex") !== doc.sha256) throw falha(503, "Falha na verificação de integridade do PDF.");
    }
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
            const { data, error } = await supabase.from("documentos_pacientes").select("id,paciente_id,nome_original,tamanho_bytes,criado_em,sha256,arquivo:documentos_arquivos(finalizado_em,finalizado_por,temporario_removido_em)").eq("paciente_id", pacienteId).order("criado_em", { ascending: false }).limit(1000);
            if (error) throw falha(503, "Documentos indisponíveis. Verifique a configuração do armazenamento.");
            const { error: auditError } = await supabase.from("documentos_auditoria").insert({ paciente_id: pacienteId, usuario_id: usuario.id, acao: "listar" });
            if (auditError) throw falha(503, "Não foi possível registrar a consulta.");
            return (data || []).map(({arquivo: final, ...doc}) => ({ ...doc, estado: final ? "arquivado" : "pendente", finalizado_em: final?.finalizado_em || null, limpeza_pendente: !!final && !final.temporario_removido_em }));
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
        async baixar(pacienteId, documentoId, usuario, acao = "baixar") {
            const doc = await registro(pacienteId, documentoId);
            const final = await arquivo(documentoId);
            await auditar(doc, usuario, acao);
            const buffer = final ? await arquivoS3.baixar(final) : await bytesTemporarios(doc);
            conferirBytes(doc, buffer);
            return { buffer, nome: doc.nome_original, sha256: doc.sha256 };
        },
        async finalizar(pacienteId, documentoId, usuario, confirmacao) {
            if (confirmacao?.conferido !== true) throw falha(400, "Confirme a conferência das páginas, assinatura e paciente.");
            const doc = await registro(pacienteId, documentoId);
            if (confirmacao.sha256 !== doc.sha256) throw falha(409, "Abra e confira este PDF antes de finalizar.");
            let final = await arquivo(documentoId);
            if (!final) {
                const buffer = await bytesTemporarios(doc);
                conferirBytes(doc, buffer);
                const destino = await arquivoS3.gravar(`prontuarios/${doc.caminho}`, buffer, doc.sha256);
                const { data, error } = await supabase.rpc("kahenna_finalizar_documento", {
                    p_documento: documentoId, p_paciente: pacienteId, p_hash: doc.sha256, p_usuario: usuario.id,
                    p_bucket: destino.bucket, p_chave: destino.chave, p_versao: destino.versao
                });
                if (error || !data) throw falha(503, "A cópia temporária foi preservada. Tente finalizar novamente.");
                final = data;
            }
            // On retries, verify the pinned S3 version again before deleting the temporary copy.
            conferirBytes(doc, await arquivoS3.baixar(final));
            const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([doc.caminho]);
            let limpezaPendente = !!cleanupError;
            if (!limpezaPendente) {
                const resultado = await supabase.rpc("kahenna_confirmar_limpeza_documento", { p_documento: documentoId });
                limpezaPendente = !!resultado.error;
            }
            return { estado: "arquivado", finalizado_em: final.finalizado_em, limpeza_pendente: limpezaPendente };
        }
    };
}
module.exports = { criarServico, validarPDF, validarId, MAX_BYTES, BUCKET };
