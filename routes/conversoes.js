"use strict";

const express = require("express");

const router = express.Router();

const conversoesController =
    require(
        "../controllers/conversoesController"
    );


// Resumo financeiro

router.get(
    "/resumo",
    conversoesController.obterResumoReceita
);


router.get(
    "/paciente/:visitanteId",
    conversoesController.buscarConversaoPaciente
);


router.put(
    "/paciente/:visitanteId",
    conversoesController.salvarConversaoPaciente
);


// Criar conversão manual

router.post(
    "/",
    conversoesController.criarConversao
);


// Buscar conversões

router.get(
    "/",
    conversoesController.listarConversoes
);


// Atualizar status

router.put(
    "/status",
    conversoesController.atualizarStatus
);


module.exports = router;
