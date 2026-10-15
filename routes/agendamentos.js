"use strict";

const express = require("express");

const router = express.Router();

const agendamentosController =
    require(
        "../controllers/agendamentosController"
    );


router.post(
    "/api/agendamentos",
    agendamentosController.criarAgendamento
);

router.get(
    "/api/agendamentos",
    agendamentosController.listarAgendamentosPeriodo
);

router.patch(
    "/api/agendamentos/:id/cancelar",
    agendamentosController.cancelarAgendamento
);


router.get(
    "/api/agendamentos/hoje",
    agendamentosController.listarAgendamentosHoje
);


router.get(
    "/api/agendamentos/paciente/:visitanteId",
    agendamentosController.buscarAgendamentoPaciente
);


router.patch('/api/agendamentos/:id/acompanhamento', agendamentosController.atualizarAcompanhamento);
module.exports = router;
