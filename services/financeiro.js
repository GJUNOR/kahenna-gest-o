"use strict";

const supabase = require("../config/supabase");




function erro(mensagem, statusCode = 400) {
    const falha = new Error(mensagem);
    falha.statusCode = statusCode;
    return falha;
}

function pagamento(valor) {
    const forma = String(valor || "").trim().toLowerCase();
    if (!["pix", "dinheiro", "debito", "credito"].includes(forma)) {
        throw erro("Selecione uma forma de pagamento válida.");
    }
    return forma;
}

function responsavel(usuario) {
    return {
        registrado_por_id: usuario.id,
        registrado_por_email: usuario.email,
        registrado_por_nome: usuario.user_metadata?.nome || usuario.email
    };
}

async function listar(visitanteId) {
    const { data, error } = await supabase.from("lancamentos_financeiros")
        .select("*").eq("visitante_id", visitanteId)
        .order("criado_em", { ascending: false });
    if (error) throw error;
    const lancamentos = data || [];
    const total = lancamentos.reduce((soma, item) =>
        soma + (item.tipo === "reembolso" ? -Number(item.valor) : Number(item.valor)), 0);
    return { lancamentos, total };
}

async function listarMovimentacoesDoPeriodo(inicioRecebido, fimRecebido) {
    const inicio = new Date(String(inicioRecebido || ""));
    const fim = new Date(String(fimRecebido || ""));

    if (
        Number.isNaN(inicio.getTime()) ||
        Number.isNaN(fim.getTime()) ||
        inicio.getTime() >= fim.getTime()
    ) {
        throw erro("Informe um período financeiro válido.");
    }

    const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select(`
            visitante_id,
            tipo,
            descricao,
            valor,
            forma_pagamento,
            parcelas,
            criado_em
        `)
        .gte("criado_em", inicio.toISOString())
        .lt("criado_em", fim.toISOString())
        .order("criado_em", { ascending: true });

    if (error) throw error;

    const visitanteIds = [
        ...new Set(
            (data || [])
                .map((item) => String(item.visitante_id || "").trim())
                .filter(Boolean)
        )
    ];

    return {
        visitante_ids: visitanteIds,
        total_pacientes: visitanteIds.length,
        movimentacoes: data || []
    };
}

function operacao(dados) {
    const id = dados.operacao_id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""))) throw erro("Identificador da operação ausente. Atualize a página e tente novamente.");
    return id;
}
async function executar(nome, visitanteId, dados, usuario) {
    const { data, error } = await supabase.rpc(nome, { p_paciente: visitanteId, p_dados: { ...dados, ...responsavel(usuario) }, p_usuario: usuario.id, p_operacao: operacao(dados) });
    if (error) {
        if (error.code === "P0001") throw erro(error.message, 409);
        throw erro("Não foi possível registrar a operação financeira. Tente novamente.", 503);
    }
    return data;
}
async function registrar(visitanteId, dados, usuario) {
    const forma = pagamento(dados.forma_pagamento);
    const valor = Number(dados.valor), descricao = String(dados.descricao || "").trim();
    const parcelas = forma === "credito" ? Number(dados.parcelas || 1) : 1;
    if (dados.tipo !== "atendimento" || !Number.isFinite(valor) || valor <= 0 || valor > 1000000 || !descricao || descricao.length > 200 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.000001) throw erro("Informe a descrição e um valor válido para o atendimento.");
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12) throw erro("Número de parcelas inválido.");
    return executar("kahenna_registrar_financeiro", visitanteId, { ...dados, descricao, valor, forma_pagamento: forma, parcelas }, usuario);
}
async function reembolsar(visitanteId, dados, usuario) {
    if (!Number.isSafeInteger(Number(dados.lancamento_id)) || Number(dados.lancamento_id) < 1 || !Number.isFinite(Number(dados.valor)) || Number(dados.valor) <= 0 || !String(dados.observacao || "").trim()) throw erro("Informe o lançamento, valor e motivo do reembolso.");
    return executar("kahenna_reembolsar_financeiro", visitanteId, dados, usuario);
}

module.exports = {
    listar,
    listarMovimentacoesDoPeriodo,
    registrar,
    reembolsar
};
