"use strict";

const express = require("express");
const equipeController = require("../controllers/equipeController");

const router = express.Router();

router.get("/", equipeController.listarEquipe);
router.post("/convites", equipeController.convidarSecretaria);
router.patch("/:id/acesso", equipeController.alterarAcesso);

module.exports = router;
