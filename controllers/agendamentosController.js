"use strict";

const agendamentosService =
    require("../services/agendamentos");


async function criarAgendamento(req, res) {
    try {
        const agendamento =
            await agendamentosService
                .criarOuAtualizarAgendamento({
                    visitanteId:
                        req.body.visitante_id,
                    dataAvaliacao:
                        req.body.data_avaliacao,
                    observacao:
                        req.body.observacao,
                    agendamentoId: req.body.agendamento_id
                });

        return res.status(200).json({
            sucesso: true,
            data: agendamento
        });
    } catch (erro) {
        console.error(
            "Erro salvando agendamento:",
            erro
        );

        return res
            .status(
                erro.statusCode || 500
            )
            .json({
                sucesso: false,
                mensagem:
                    (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") ||
                    "Erro salvando agendamento."
            });
    }
}


async function listarAgendamentosHoje(
    req,
    res
) {
    try {
        const {
            inicio,
            fim
        } = req.query;

        if (!inicio || !fim) {
            return res.status(400).json({
                sucesso: false,
                mensagem:
                    "Início e fim são obrigatórios."
            });
        }

        const agendamentos =
            await agendamentosService
                .listarAgendamentosDoDia(
                    inicio,
                    fim
                );

        return res.status(200).json({
            sucesso: true,
            data: agendamentos,
            total: agendamentos.length
        });
    } catch (erro) {
        console.error(
            "Erro listando agendamentos:",
            erro
        );

        return res.status(500).json({
            sucesso: false,
            mensagem:
                (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") ||
                "Erro listando agendamentos."
        });
    }
}


async function buscarAgendamentoPaciente(
    req,
    res
) {
    try {
        const agendamento =
            await agendamentosService
                .buscarAgendamentoPaciente(
                    req.params.visitanteId
                );

        return res.status(200).json({
            sucesso: true,
            data: agendamento
        });
    } catch (erro) {
        console.error(
            "Erro buscando agendamento:",
            erro
        );

        return res
            .status(
                erro.statusCode || 500
            )
            .json({
                sucesso: false,
                mensagem:
                    (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") ||
                    "Erro buscando agendamento."
            });
    }
}

async function listarAgendamentosPeriodo(req, res) {
    try {
        const agendamentos = await agendamentosService
            .listarAgendamentosDoPeriodo(
                req.query.inicio,
                req.query.fim
            );

        return res.status(200).json({
            sucesso: true,
            data: agendamentos,
            total: agendamentos.length
        });
    } catch (erro) {
        console.error("Erro listando agenda:", erro);
        return res.status(erro.statusCode || 500).json({
            sucesso: false,
            mensagem: (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") || "Erro listando agenda."
        });
    }
}

async function cancelarAgendamento(req, res) {
    try {
        const agendamento = await agendamentosService
            .cancelarAgendamento(req.params.id);

        return res.status(200).json({
            sucesso: true,
            data: agendamento
        });
    } catch (erro) {
        console.error("Erro cancelando agendamento:", erro);
        return res.status(erro.statusCode || 500).json({
            sucesso: false,
            mensagem: (erro.statusCode && erro.statusCode < 500 ? erro.message : "Não foi possível concluir a operação.") || "Erro cancelando agendamento."
        });
    }
}


async function atualizarAcompanhamento(req,res){
 try{const data=await agendamentosService.atualizarAcompanhamento(req.params.id,req.body);return res.json({sucesso:true,data});}
 catch(error){return res.status(error.statusCode||500).json({sucesso:false,mensagem:error.statusCode?(error.statusCode && error.statusCode < 500 ? error.message : "Não foi possível concluir a operação."):'Não foi possível salvar a marcação.'});}
}
module.exports = {
    atualizarAcompanhamento,
    criarAgendamento,
    listarAgendamentosHoje,
    listarAgendamentosPeriodo,
    cancelarAgendamento,
    buscarAgendamentoPaciente
};
