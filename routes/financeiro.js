"use strict";
const express = require("express");
const controller = require("../controllers/financeiroController");
const router = express.Router();
router.get("/movimentacoes-do-dia", controller.listarMovimentacoesDoDia);
router.get("/paciente/:visitanteId", controller.listar);
router.post("/paciente/:visitanteId", controller.registrar);
router.post("/paciente/:visitanteId/reembolsos", controller.reembolsar);
module.exports = router;
