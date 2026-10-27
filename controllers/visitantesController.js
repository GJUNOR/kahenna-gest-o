"use strict";

const visitantesService =
    require("../services/visitantes");

// ======================================================
// LISTAR VISITANTES
// ======================================================

async function listarVisitantes(req, res) {
    try {
        const visitantes =
            await visitantesService.listarVisitantes();

        return res.status(200).json(visitantes);
    } catch (erro) {
        console.error(
            "Erro listando visitantes:",
            erro
        );

        return res.status(500).json({
            sucesso: false,
            mensagem:
                (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") ||
                "Erro ao carregar visitantes."
        });
    }
}

// ======================================================
// CRIAR VISITANTE
// ======================================================

async function criarVisitante(req, res) {
    try {
        const visitante =
            await visitantesService.criarVisitante(
                req.body
            );

        return res.status(201).json({
            sucesso: true,
            mensagem:
                "Paciente cadastrado com sucesso.",
            data: visitante
        });
    } catch (erro) {
        console.error(
            "Erro criando visitante:",
            erro
        );

        return res.status(
            erro.statusCode || 500
        ).json({
            sucesso: false,
            mensagem:
                (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") ||
                "Erro ao cadastrar paciente."
        });
    }
}

// ======================================================
// ATUALIZAR VISITANTE
// ======================================================

async function atualizarVisitante(req, res) {
    try {
        const visitanteId = req.params.id;

        const visitante =
            await visitantesService.atualizarVisitante(
                visitanteId,
                req.body
            );

        return res.status(200).json({
            sucesso: true,
            mensagem:
                "Paciente atualizado com sucesso.",
            data: visitante
        });
    } catch (erro) {
        console.error(
            "Erro atualizando visitante:",
            erro
        );

        return res.status(
            erro.statusCode || 500
        ).json({
            sucesso: false,
            mensagem:
                (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") ||
                "Erro ao atualizar paciente."
        });
    }
}

// ======================================================
// EXPORTAÇÕES
// ======================================================

module.exports = {
    listarVisitantes,
    criarVisitante,
    atualizarVisitante
};