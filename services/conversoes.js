"use strict";

const supabase =
    require("../config/supabase");

const FUSO_HORARIO =
    "America/Sao_Paulo";


// ==========================================
// REGISTRAR CONVERSÃO DO RASTREAMENTO
// ==========================================

async function registrarConversao(conversao) {
    const { data: existente, error: erroBusca } =
        await supabase
            .from("conversoes")
            .select("*")
            .eq(
                "sessao_id",
                conversao.sessao_id
            )
            .eq(
                "tipo",
                conversao.tipo
            )
            .maybeSingle();

    if (erroBusca) {
        throw erroBusca;
    }

    if (existente) {
        return {
            id: existente.id,
            nova: false,
            dados: existente
        };
    }

    const { data, error } =
        await supabase
            .from("conversoes")
            .insert({
                ...conversao,
                valor_atualizado_em:
                    new Date().toISOString()
            })
            .select("*")
            .single();

    if (error) {
        console.error(
            "Erro criando conversão:",
            error
        );

        throw error;
    }

    return {
        id: data.id,
        nova: true,
        dados: data
    };
}


// ==========================================
// CRIAR CONVERSÃO MANUAL
// ==========================================

async function criarConversao(conversao) {
    const { data, error } =
        await supabase
            .from("conversoes")
            .insert({
                ...conversao,
                valor_atualizado_em:
                    new Date().toISOString()
            })
            .select("*")
            .single();

    if (error) {
        throw error;
    }

    return data;
}


// ==========================================
// CONVERSÃO FINANCEIRA DO PACIENTE
// ==========================================

async function buscarConversaoPaciente(
    visitanteId
) {
    const { data, error } =
        await supabase
            .from("conversoes")
            .select("*")
            .eq(
                "visitante_id",
                visitanteId
            )
            .eq(
                "tipo",
                "manual"
            )
            .order(
                "criado_em",
                {
                    ascending: false
                }
            )
            .limit(1)
            .maybeSingle();

    if (error) {
        throw error;
    }

    return data || null;
}


async function salvarConversaoPaciente(
    visitanteId,
    dadosRecebidos
) {
    if (!visitanteId) {
        throw new Error(
            "visitante_id não informado."
        );
    }

    const valor =
        Number(dadosRecebidos.valor);

    if (
        !Number.isFinite(valor) ||
        valor <= 0
    ) {
        throw new Error(
            "Informe um valor de conversão válido."
        );
    }

    const existente =
        await buscarConversaoPaciente(
            visitanteId
        );

    const dados = {
        visitante_id: visitanteId,
        tipo: "manual",
        valor,
        observacao:
            dadosRecebidos.observacao || null,
        status: "confirmado",
        origem: "manual"
    };

    if (existente) {
        const { data, error } =
            await supabase
                .from("conversoes")
                .update(dados)
                .eq(
                    "id",
                    existente.id
                )
                .select("*")
                .single();

        if (error) {
            throw error;
        }

        return data;
    }

    const { data, error } =
        await supabase
            .from("conversoes")
            .insert({
                ...dados,
                valor_atualizado_em:
                    new Date().toISOString()
            })
            .select("*")
            .single();

    if (error) {
        throw error;
    }

    return data;
}


// ==========================================
// LISTAR CONVERSÕES
// ==========================================

async function buscarConversoes() {
    const { data, error } =
        await supabase
            .from("conversoes")
            .select("*")
            .order(
                "criado_em",
                {
                    ascending: false
                }
            );

    if (error) {
        throw error;
    }

    return Array.isArray(data)
        ? data
        : [];
}


async function listarConversoes() {
    return buscarConversoes();
}


// ==========================================
// ATUALIZAR STATUS
// ==========================================

async function atualizarStatusPorId(
    conversaoId,
    status
) {
    if (!conversaoId) {
        throw new Error(
            "conversao_id não informado."
        );
    }

    if (!status) {
        throw new Error(
            "Status não informado."
        );
    }

    const { data, error } =
        await supabase
            .from("conversoes")
            .update({
                status
            })
            .eq(
                "id",
                conversaoId
            )
            .select("*")
            .single();

    if (error) {
        throw error;
    }

    return data;
}


// ==========================================
// DATAS FINANCEIRAS
// ==========================================

function obterPartesDaDataNoBrasil(data) {
    const partes =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: FUSO_HORARIO,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(data);

    const valores = {};

    partes.forEach((parte) => {
        if (parte.type !== "literal") {
            valores[parte.type] =
                Number(parte.value);
        }
    });

    return {
        ano: valores.year,
        mes: valores.month,
        dia: valores.day
    };
}


function criarInicioDoDiaEmSaoPaulo(
    ano,
    mes,
    dia
) {
    const anoTexto =
        String(ano).padStart(4, "0");

    const mesTexto =
        String(mes).padStart(2, "0");

    const diaTexto =
        String(dia).padStart(2, "0");

    return new Date(
        `${anoTexto}-${mesTexto}-${diaTexto}T00:00:00-03:00`
    );
}


function adicionarDiasDeCalendario(
    ano,
    mes,
    dia,
    quantidade
) {
    const data = new Date(
        Date.UTC(
            ano,
            mes - 1,
            dia + quantidade
        )
    );

    return {
        ano: data.getUTCFullYear(),
        mes: data.getUTCMonth() + 1,
        dia: data.getUTCDate()
    };
}


// ==========================================
// RESUMO DA RECEITA
// ==========================================

async function calcularResumoReceita() {
    const agora = new Date();

    const hoje =
        obterPartesDaDataNoBrasil(agora);

    const amanha =
        adicionarDiasDeCalendario(
            hoje.ano,
            hoje.mes,
            hoje.dia,
            1
        );

    const proximoMes =
        hoje.mes === 12
            ? {
                ano: hoje.ano + 1,
                mes: 1,
                dia: 1
            }
            : {
                ano: hoje.ano,
                mes: hoje.mes + 1,
                dia: 1
            };

    const inicioHoje =
        criarInicioDoDiaEmSaoPaulo(
            hoje.ano,
            hoje.mes,
            hoje.dia
        );

    const inicioAmanha =
        criarInicioDoDiaEmSaoPaulo(
            amanha.ano,
            amanha.mes,
            amanha.dia
        );

    const inicioMes =
        criarInicioDoDiaEmSaoPaulo(
            hoje.ano,
            hoje.mes,
            1
        );

    const inicioProximoMes =
        criarInicioDoDiaEmSaoPaulo(
            proximoMes.ano,
            proximoMes.mes,
            1
        );

    const { data, error } =
        await supabase
            .from("conversoes")
            .select(
                "id, valor, valor_atualizado_em"
            )
            .gte(
                "valor_atualizado_em",
                inicioMes.toISOString()
            )
            .lt(
                "valor_atualizado_em",
                inicioProximoMes.toISOString()
            );

    if (error) {
        throw error;
    }

    let receitaHoje = 0;
    let receitaMes = 0;

    (data || []).forEach((conversao) => {
        const valor =
            Number(conversao.valor || 0);

        if (
            !Number.isFinite(valor) ||
            valor <= 0
        ) {
            return;
        }

        receitaMes += valor;

        const dataAtualizacao =
            new Date(
                conversao.valor_atualizado_em
            );

        if (
            dataAtualizacao >= inicioHoje &&
            dataAtualizacao < inicioAmanha
        ) {
            receitaHoje += valor;
        }
    });

    const { data: lancamentos, error: erroFinanceiro } = await supabase
        .from("lancamentos_financeiros")
        .select("tipo, valor, criado_em")
        .gte("criado_em", inicioMes.toISOString())
        .lt("criado_em", inicioProximoMes.toISOString());

    if (erroFinanceiro) throw erroFinanceiro;

    (lancamentos || []).forEach((lancamento) => {
        const sinal = lancamento.tipo === "reembolso" ? -1 : 1;
        const valor = Number(lancamento.valor || 0) * sinal;
        receitaMes += valor;
        const dataLancamento = new Date(lancamento.criado_em);
        if (dataLancamento >= inicioHoje && dataLancamento < inicioAmanha) {
            receitaHoje += valor;
        }
    });

    return {
        receitaHoje,
        receitaMes,
        periodo: {
            inicioHoje:
                inicioHoje.toISOString(),
            inicioAmanha:
                inicioAmanha.toISOString(),
            inicioMes:
                inicioMes.toISOString(),
            inicioProximoMes:
                inicioProximoMes.toISOString()
        }
    };
}


module.exports = {
    registrarConversao,
    criarConversao,
    buscarConversoes,
    listarConversoes,
    atualizarStatusPorId,
    buscarConversaoPaciente,
    salvarConversaoPaciente,
    calcularResumoReceita
};
