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

async function registrar(visitanteId, dados, usuario) {
    const tipo = String(dados.tipo || "").trim().toLowerCase();
    const forma = pagamento(dados.forma_pagamento);
    const parcelas = forma === "credito" ? Number(dados.parcelas || 1) : 1;
    let registro;
    let statusPaciente;


    const { data: pacienteAtual, error: erroPaciente } = await supabase
        .from("visitantes")
        .select("visitante_id, status, telefone")
        .eq("visitante_id", visitanteId)
        .maybeSingle();

    if (erroPaciente) throw erroPaciente;
    if (!pacienteAtual) throw erro("Paciente não encontrado.", 404);

    const statusAtual = String(pacienteAtual.status || "novo")
        .trim()
        .toLowerCase();

    const valor = Number(dados.valor);
    const descricao = String(dados.descricao || "").trim();
    if (tipo !== "atendimento" || !Number.isFinite(valor) || valor <= 0 || valor > 1000000 || !descricao || descricao.length > 200) throw erro("Informe a descrição e um valor válido para o atendimento.");
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12) throw erro("Número de parcelas inválido.");
    statusPaciente = "convertido";
    registro = { visitante_id: visitanteId, tipo, descricao, valor, forma_pagamento: forma, parcelas, observacao: dados.observacao || null };

    const { data, error } = await supabase.from("lancamentos_financeiros")
        .insert({ ...registro, ...responsavel(usuario) }).select("*").single();
    if (error) throw error;

    const { data: paciente, error: erroStatus } = await supabase
        .from("visitantes")
        .update({ status: statusPaciente })
        .eq("visitante_id", visitanteId)
        .select("visitante_id, status")
        .maybeSingle();

    if (erroStatus || !paciente) {
        const { error: erroDesfazer } = await supabase
            .from("lancamentos_financeiros")
            .delete()
            .eq("id", data.id);

        if (erroDesfazer) {
            console.error(
                "Não foi possível desfazer o lançamento após falha no status:",
                erroDesfazer
            );
        }

        if (erroStatus) throw erroStatus;
        throw erro("Paciente não encontrado para conversão.", 404);
    }

    return { lancamento: data, paciente };
}

async function reembolsar(visitanteId, dados, usuario) {
    const lancamentoId = Number(dados.lancamento_id);
    const valor = Number(dados.valor);
    const observacao = String(dados.observacao || "").trim();
    if (!lancamentoId || !Number.isFinite(valor) || valor <= 0 || !observacao) {
        throw erro("Informe o lançamento, o valor e o motivo do reembolso.");
    }
    const { data: original, error } = await supabase.from("lancamentos_financeiros")
        .select("*").eq("id", lancamentoId).eq("visitante_id", visitanteId)
        .neq("tipo", "reembolso").maybeSingle();
    if (error) throw error;
    if (!original) throw erro("Lançamento original não encontrado.", 404);
    const { data: anteriores, error: erroAnteriores } = await supabase
        .from("lancamentos_financeiros").select("valor")
        .eq("reembolso_de_id", lancamentoId).eq("tipo", "reembolso");
    if (erroAnteriores) throw erroAnteriores;
    const reembolsado = (anteriores || []).reduce((soma, item) => soma + Number(item.valor), 0);
    if (reembolsado + valor > Number(original.valor)) {
        throw erro("O reembolso ultrapassa o valor disponível deste lançamento.");
    }
    const { data, error: erroInsert } = await supabase.from("lancamentos_financeiros")
        .insert({ visitante_id: visitanteId, tipo: "reembolso",
            descricao: `Reembolso: ${original.descricao}`, valor,
            reembolso_de_id: lancamentoId, observacao, ...responsavel(usuario) })
        .select("*").single();
    if (erroInsert) throw erroInsert;
    return data;
}

module.exports = {
    listar,
    listarMovimentacoesDoPeriodo,
    registrar,
    reembolsar
};
