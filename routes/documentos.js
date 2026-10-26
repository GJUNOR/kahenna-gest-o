"use strict";
const express = require("express");
const { criarServico, MAX_BYTES } = require("../services/documentos");
const { exigirAdministradorApi } = require("../middleware/auth");
function criarRotas(supabase, autorizar = exigirAdministradorApi) {
    const router = express.Router();
    const servico = criarServico(supabase);
    router.use(autorizar);
    // Bound memory use while raw PDF bodies and downloads are in flight.
    let ativos = 0;
    router.use((req, res, next) => {
        if (ativos >= 2) { res.set("Retry-After", "5"); return res.status(429).json({ sucesso: false, mensagem: "Aguarde a transferência atual e tente novamente." }); }
        ativos++;
        let liberado = false;
        function liberar() { if (!liberado) { liberado = true; ativos--; } }
        res.once("finish", liberar); res.once("close", liberar);
        next();
    });
    router.get("/:pacienteId/documentos", async (req, res) => res.json({ sucesso: true, documentos: await servico.listar(req.params.pacienteId, req.usuario) }));
    router.post("/:pacienteId/documentos", (req, res, next) => {
        if (!req.is("application/pdf")) return res.status(415).json({ sucesso: false, mensagem: "Envie somente arquivos PDF." });
        next();
    }, express.raw({ type: "application/pdf", limit: MAX_BYTES, inflate: false }), async (req, res) => {
        let nome;
        try { nome = decodeURIComponent(req.get("X-Document-Name") || ""); } catch { return res.status(400).json({ sucesso: false, mensagem: "Nome de arquivo inválido." }); }
        const doc = await servico.enviar(req.params.pacienteId, req.usuario, req.body, nome);
        res.status(201).json({ sucesso: true, documento: { id: doc.id, nome_original: doc.nome_original, tamanho_bytes: doc.tamanho_bytes, criado_em: doc.criado_em } });
    });
    router.get("/:pacienteId/documentos/:documentoId/arquivo", async (req, res) => {
        const doc = await servico.baixar(req.params.pacienteId, req.params.documentoId, req.usuario);
        res.set({ "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(doc.nome).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}` });
        res.send(doc.buffer);
    });
    router.use((err, req, res, next) => {
        const status = err.status || err.statusCode || 500;
        const mensagem = err.type === "entity.too.large" ? "O PDF deve ter no máximo 15 MB." : status >= 500 ? "Não foi possível concluir a operação. Verifique a configuração e tente novamente." : err.message;
        if (status >= 500) console.error("Falha na operação de documentos.");
        res.status(status).json({ sucesso: false, mensagem });
    });
    return router;
}
module.exports = criarRotas;
