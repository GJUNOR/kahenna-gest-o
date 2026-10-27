"use strict";
const { createHash } = require("node:crypto");
const { S3Client, PutObjectCommand, GetObjectCommand, GetPublicAccessBlockCommand, GetBucketVersioningCommand } = require("@aws-sdk/client-s3");
const MAX_BYTES = 15 * 1024 * 1024;
function falha() { return Object.assign(new Error("Arquivamento indisponível. O PDF foi mantido no Supabase."), { statusCode: 503 }); }
function criarArquivoS3({ client, bucket = process.env.KAHENNA_S3_BUCKET, region = process.env.AWS_REGION } = {}) {
    let s3 = client;
    function cliente() {
        if (!bucket || !region) throw falha();
        return s3 ||= new S3Client({ region, maxAttempts: 3, requestHandler: { connectionTimeout: 5000, requestTimeout: 60000 } });
    }
    async function ler(chave, versao, destino = bucket) {
        if (destino !== bucket || !versao || versao === "null") throw falha();
        const result = await cliente().send(new GetObjectCommand({ Bucket: bucket, Key: chave, VersionId: versao }));
        if (!result.ContentLength || result.ContentLength > MAX_BYTES) { result.Body?.destroy?.(); throw falha(); }
        const chunks = []; let total = 0;
        for await (const chunk of result.Body) {
            total += chunk.length;
            if (total > MAX_BYTES) { result.Body.destroy?.(); throw falha(); }
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }
    return {
        async gravar(chave, buffer, hash) {
            try {
                const c = cliente();
                const [acesso, versionamento] = await Promise.all([
                    c.send(new GetPublicAccessBlockCommand({ Bucket: bucket })),
                    c.send(new GetBucketVersioningCommand({ Bucket: bucket }))
                ]);
                const p = acesso.PublicAccessBlockConfiguration;
                if (!p || ![p.BlockPublicAcls, p.IgnorePublicAcls, p.BlockPublicPolicy, p.RestrictPublicBuckets].every(v => v === true) || versionamento.Status !== "Enabled") throw falha();
                let versao;
                try {
                    const result = await c.send(new PutObjectCommand({ Bucket: bucket, Key: chave, Body: buffer,
                        ContentType: "application/pdf", ServerSideEncryption: "AES256", CacheControl: "no-store",
                        ChecksumSHA256: Buffer.from(hash, "hex").toString("base64"), IfNoneMatch: "*" }));
                    versao = result.VersionId;
                } catch (err) {
                    // A retry after an interrupted database commit reuses the same immutable key.
                    if (err.$metadata?.httpStatusCode !== 412) throw err;
                    const existing = await c.send(new GetObjectCommand({ Bucket: bucket, Key: chave }));
                    versao = existing.VersionId;
                    existing.Body?.destroy?.();
                }
                const copia = await ler(chave, versao);
                if (copia.length !== buffer.length || createHash("sha256").update(copia).digest("hex") !== hash) throw falha();
                return { bucket, chave, versao };
            } catch { throw falha(); }
        },
        async baixar(arquivo) {
            try { return await ler(arquivo.chave_s3, arquivo.versao_s3, arquivo.bucket_s3); }
            catch { throw Object.assign(new Error("Não foi possível recuperar o PDF arquivado."), { statusCode: 503 }); }
        }
    };
}
module.exports = { criarArquivoS3 };
