const assert=require("node:assert/strict");
const {BUCKET}=require("../services/documentos");
const paciente = "11111111-1111-4111-8111-111111111111";
const outro = "22222222-2222-4222-8222-222222222222";
const usuario = { id: "33333333-3333-4333-8333-333333333333", app_metadata: { ativo: true, papel: "administrador" } };
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
function fake(options = {}) {
    const docs = new Map(), objects = new Map(), archives = new Map(), audits = [];
    const client = {
        docs, objects, archives, audits,
        from(table) {
            const filters = {};
            const builder = {
                select() { return builder; }, eq(k,v) { filters[k]=v; return builder; }, order() { return builder; },
                async maybeSingle() {
                    if (table === "documentos_arquivos") return { data: archives.get(filters.documento_id) || null };
                    if (table === "visitantes") return { data: filters.visitante_id === paciente ? { visitante_id: paciente } : null };
                    return { data: [...docs.values()].find(d => Object.entries(filters).every(([k,v])=>d[k]===v)) || null };
                },
                async limit() { return { data: [...docs.values()].filter(d => d.paciente_id === filters.paciente_id).map(({caminho,bucket,enviado_por,...d})=>({...d,arquivo:archives.get(d.id)||null})) }; },
                async insert(record) { if (options.auditFails) return { error: new Error("audit failed") }; audits.push(record); return { error: null }; }
            };
            return builder;
        },
        storage: {
            async getBucket() { return { data: { public: !!options.publicBucket } }; },
            from() { return {
                async upload(path, body, config) { assert.equal(config.upsert,false); objects.set(path,body); return {}; },
                async remove(paths) { if(options.cleanupFails) return {error:new Error("cleanup failed")}; paths.forEach(p=>objects.delete(p)); return {}; },
                async download(path) { const body=objects.get(path); return body ? { data:new Blob([body]) } : { error:new Error("missing") }; }
            }; }
        },
        async rpc(name,p) {
            if(name === "kahenna_confirmar_limpeza_documento") {archives.get(p.p_documento).temporario_removido_em=new Date().toISOString();return {error:null};}
            if(name === "kahenna_finalizar_documento") {
                if(options.finalizationFails) return {error:new Error("commit failed")};
                if(!archives.has(p.p_documento)) {archives.set(p.p_documento,{documento_id:p.p_documento,paciente_id:p.p_paciente,bucket_s3:p.p_bucket,chave_s3:p.p_chave,versao_s3:p.p_versao,sha256:p.p_hash,finalizado_por:p.p_usuario,finalizado_em:new Date().toISOString()});audits.push({acao:"finalizar"});}
                return {data:archives.get(p.p_documento)};
            }
            if (options.registrationFails) return { error:new Error("registration failed") };
            const record={ id:p.p_id,paciente_id:p.p_paciente,nome_original:p.p_nome,caminho:p.p_caminho,tamanho_bytes:p.p_tamanho,sha256:p.p_hash,bucket:BUCKET,criado_em:new Date().toISOString() };
            docs.set(record.id,record); audits.push({acao:"enviar"}); return {data:[record]};
        }
    };
    return client;
}
module.exports={fake,paciente,outro,usuario,pdf};

