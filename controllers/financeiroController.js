"use strict";
const financeiro = require("../services/financeiro");

async function listarMovimentacoesDoDia(req, res) {
    try {
        const dados = await financeiro.listarMovimentacoesDoPeriodo(
            req.query.inicio,
            req.query.fim
        );

        return res.json({ sucesso: true, ...dados });
    } catch (erro) {
        console.error("Erro listando movimentações financeiras:", erro);
        return res.status(erro.statusCode || 500).json({
            sucesso: false,
            mensagem: erro.message
        });
    }
}

async function listar(req, res) {
    try { return res.json({ sucesso: true, ...await financeiro.listar(req.params.visitanteId) }); }
    catch (erro) { console.error("Erro listando financeiro:", erro); return res.status(500).json({ sucesso: false, mensagem: erro.message }); }
}
async function registrar(req, res) {
    try { const dados = await financeiro.registrar(req.params.visitanteId, req.body, req.usuario); return res.status(201).json({ sucesso: true, dados }); }
    catch (erro) { console.error("Erro registrando financeiro:", erro); return res.status(erro.statusCode || 500).json({ sucesso: false, mensagem: erro.message }); }
}
async function reembolsar(req, res) {
    try { const dados = await financeiro.reembolsar(req.params.visitanteId, req.body, req.usuario); return res.status(201).json({ sucesso: true, dados }); }
    catch (erro) { console.error("Erro registrando reembolso:", erro); return res.status(erro.statusCode || 500).json({ sucesso: false, mensagem: erro.message }); }
}
module.exports = {
    listar,
    listarMovimentacoesDoDia,
    registrar,
    reembolsar
};
