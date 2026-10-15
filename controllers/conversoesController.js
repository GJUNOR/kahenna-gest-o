"use strict";

const conversoesService =
    require("../services/conversoes");


async function listarConversoes(req, res) {
    try {
        const dados =
            await conversoesService
                .buscarConversoes();

        return res.status(200).json(dados);
    } catch (error) {
        console.error(
            "Erro buscando conversões:",
            error
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                error.message ||
                "Erro buscando conversões."
        });
    }
}


async function criarConversao(req, res) {
    try {
        const conversao =
            await conversoesService
                .criarConversao(req.body);

        return res.status(201).json({
            sucesso: true,
            dados: conversao
        });
    } catch (error) {
        console.error(
            "Erro criando conversão:",
            error
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                error.message ||
                "Erro criando conversão."
        });
    }
}


async function atualizarStatus(req, res) {
    try {
        const {
            conversao_id,
            status
        } = req.body;

        const resultado =
            await conversoesService
                .atualizarStatusPorId(
                    conversao_id,
                    status
                );

        return res.status(200).json({
            sucesso: true,
            dados: resultado
        });
    } catch (error) {
        console.error(
            "Erro atualizando status:",
            error
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                error.message ||
                "Erro atualizando status."
        });
    }
}


async function obterResumoReceita(req, res) {
    try {
        const resumo =
            await conversoesService
                .calcularResumoReceita();

        return res.status(200).json({
            sucesso: true,
            receitaHoje:
                resumo.receitaHoje,
            receitaMes:
                resumo.receitaMes,
            periodo:
                resumo.periodo
        });
    } catch (error) {
        console.error(
            "Erro calculando receita:",
            error
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                error.message ||
                "Erro calculando a receita."
        });
    }
}


async function buscarConversaoPaciente(
    req,
    res
) {
    try {
        const conversao =
            await conversoesService
                .buscarConversaoPaciente(
                    req.params.visitanteId
                );

        return res.status(200).json({
            sucesso: true,
            dados: conversao
        });
    } catch (error) {
        console.error(
            "Erro buscando conversão do paciente:",
            error
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                error.message ||
                "Erro buscando a conversão."
        });
    }
}


async function salvarConversaoPaciente(
    req,
    res
) {
    try {
        const conversao =
            await conversoesService
                .salvarConversaoPaciente(
                    req.params.visitanteId,
                    req.body
                );

        return res.status(200).json({
            sucesso: true,
            dados: conversao
        });
    } catch (error) {
        console.error(
            "Erro salvando conversão do paciente:",
            error
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                error.message ||
                "Erro salvando a conversão."
        });
    }
}


module.exports = {
    listarConversoes,
    criarConversao,
    atualizarStatus,
    obterResumoReceita,
    buscarConversaoPaciente,
    salvarConversaoPaciente
};
