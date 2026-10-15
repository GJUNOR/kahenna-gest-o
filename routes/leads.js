"use strict";

const express = require("express");
const router = express.Router();

const visitantesController =
    require("../controllers/visitantesController");

router.get(
    "/api/leads",
    visitantesController.listarVisitantes
);

router.post(
    "/api/leads",
    visitantesController.criarVisitante
);

router.put(
    "/api/leads/:id",
    visitantesController.atualizarVisitante
);

module.exports = router;