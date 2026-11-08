"use strict";
const express = require("express");
const controller = require("../controllers/financeiroController");
const router = express.Router();
router.get("/taxas-cartao", async (req, res) => {
    try {
        const config = await require("../services/caixa").criarServico(require("../config/supabase")).taxas();
        res.set("Cache-Control", "no-store").json({ taxas: config.taxas });
    } catch (_) { res.status(503).json({ mensagem: "Não foi possível consultar as taxas do cartão." }); }
});
router.get("/movimentacoes-do-dia", controller.listarMovimentacoesDoDia);
router.get("/paciente/:visitanteId", controller.listar);
router.post("/paciente/:visitanteId", controller.registrar);
router.post("/paciente/:visitanteId/reembolsos", controller.reembolsar);
module.exports = router;
