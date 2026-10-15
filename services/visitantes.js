"use strict";

const supabase = require("../config/supabase");
const { randomUUID } = require("crypto");

const ORIGENS_MANUAIS = new Set([
    "indicacao",
    "clinica",
    "instagram_organico",
    "google_organico",
    "outros"
]);

function validarOrigemManual(valor) {
    const origem = String(valor ?? "").trim();

    if (!ORIGENS_MANUAIS.has(origem)) {
        const erro = new Error(
            "A origem informada não é válida."
        );

        erro.statusCode = 400;
        throw erro;
    }

    return origem;
}

// ======================================================
// LISTAR VISITANTES
// ======================================================

async function listarVisitantes() {
    const { data, error } = await supabase
        .from("visitantes")
        .select("*")
        .order("ultima_visita", {
            ascending: false,
            nullsFirst: false
        });

    if (error) {
        console.error(
            "Erro listando visitantes:",
            error
        );

        throw error;
    }

    return Array.isArray(data) ? data : [];
}

// ======================================================
// OPERAÇÕES USADAS PELO TRACKER
// ======================================================

async function buscarVisitanteTracker(
    visitanteId
) {
    if (!visitanteId) {
        return null;
    }

    const { data, error } = await supabase
        .from("visitantes")
        .select("*")
        .eq("visitante_id", visitanteId)
        .maybeSingle();

    if (error) {
        console.error(
            "Erro buscando visitante do tracker:",
            error
        );

        throw error;
    }

    return data;
}

async function criarVisitanteTracker(
    visitante
) {
    const { data, error } = await supabase
        .from("visitantes")
        .insert(visitante)
        .select("*")
        .single();

    if (error) {
        console.error(
            "Erro criando visitante do tracker:",
            error
        );

        throw error;
    }

    return data;
}

async function atualizarVisitanteTracker(
    visitanteAtual,
    visitaRecebida
) {
    const atualizacao = {
        ultima_visita:
            new Date().toISOString(),

        total_visitas:
            Number(
                visitanteAtual.total_visitas || 0
            ) + 1,

        ultima_utm_source:
            visitaRecebida.utm_source || null,

        ultima_utm_medium:
            visitaRecebida.utm_medium || null,

        ultima_utm_campaign:
            visitaRecebida.utm_campaign || null
    };

    const { data, error } = await supabase
        .from("visitantes")
        .update(atualizacao)
        .eq(
            "visitante_id",
            visitanteAtual.visitante_id
        )
        .select("*")
        .single();

    if (error) {
        console.error(
            "Erro atualizando visitante do tracker:",
            error
        );

        throw error;
    }

    return data;
}

// ======================================================
// ATUALIZAR VISITANTE
// ======================================================

async function atualizarVisitante(
    visitanteId,
    dadosRecebidos
) {
    if (!visitanteId) {
        const erro = new Error(
            "visitante_id não informado."
        );

        erro.statusCode = 400;
        throw erro;
    }

    const dadosPermitidos = {};

    if (
        dadosRecebidos.nome !== undefined &&
        String(dadosRecebidos.nome).trim() !== ""
    ) {
        dadosPermitidos.nome =
            String(dadosRecebidos.nome).trim();
    }

    if (
        dadosRecebidos.telefone !== undefined &&
        String(dadosRecebidos.telefone).trim() !== ""
    ) {
        dadosPermitidos.telefone =
            String(dadosRecebidos.telefone)
                .replace(/\D/g, "");
    }

    if (
        dadosRecebidos.status !== undefined &&
        String(dadosRecebidos.status).trim() !== ""
    ) {
        dadosPermitidos.status =
            String(dadosRecebidos.status).trim();
    }

    if (
        dadosRecebidos.origem !== undefined &&
        String(dadosRecebidos.origem).trim() !== ""
    ) {
        const origem = validarOrigemManual(
            dadosRecebidos.origem
        );

        dadosPermitidos.primeira_utm_source = origem;
        dadosPermitidos.ultima_utm_source = origem;
    }

    if (
        Object.keys(dadosPermitidos).length === 0
    ) {
        const erro = new Error(
            "Nenhum campo válido foi enviado."
        );

        erro.statusCode = 400;
        throw erro;
    }

    const { data, error } = await supabase
        .from("visitantes")
        .update(dadosPermitidos)
        .eq("visitante_id", visitanteId)
        .select("*")
        .maybeSingle();

    if (error) {
        console.error(
            "Erro atualizando visitante:",
            error
        );

        throw error;
    }

    if (!data) {
        const erro = new Error(
            `Visitante não encontrado: ${visitanteId}`
        );

        erro.statusCode = 404;
        throw erro;
    }

    return data;
}



async function criarVisitante(
    dadosRecebidos
) {
    const nome = String(
        dadosRecebidos.nome ?? ""
    ).trim();

    const telefone = String(
        dadosRecebidos.telefone ?? ""
    ).replace(/\D/g, "");

    const status = String(
        dadosRecebidos.status ?? "novo"
    ).trim();

    const origem =
        dadosRecebidos.origem === undefined ||
        String(dadosRecebidos.origem).trim() === ""
            ? null
            : validarOrigemManual(
                dadosRecebidos.origem
            );

    if (!nome) {
        const erro = new Error(
            "O nome do paciente é obrigatório."
        );

        erro.statusCode = 400;
        throw erro;
    }

    if (!telefone) {
        const erro = new Error(
            "O telefone do paciente é obrigatório."
        );

        erro.statusCode = 400;
        throw erro;
    }

    const agora =
        new Date().toISOString();

    const novoVisitante = {
        visitante_id: randomUUID(),
        nome,
        telefone,
        status: status || "novo",
        criado_em: agora,
        primeira_visita: agora,
        ultima_visita: agora,
        total_visitas: 1,
        total_conversoes: 0
    };

    if (origem) {
        novoVisitante.primeira_utm_source = origem;
        novoVisitante.ultima_utm_source = origem;
    }

    const { data, error } = await supabase
        .from("visitantes")
        .insert(novoVisitante)
        .select("*")
        .single();

    if (error) {
        console.error(
            "Erro criando visitante:",
            error
        );

        throw error;
    }

    return data;
}

// ======================================================
// CONTATO RECEBIDO PELO WHATSAPP
// ======================================================

async function registrarContatoWhatsApp({
    nome,
    telefone
}) {
    const telefoneNormalizado = String(
        telefone || ""
    ).replace(/\D/g, "");

    const nomeNormalizado = String(
        nome || ""
    ).trim();

    if (!telefoneNormalizado) {
        const erro = new Error(
            "Telefone do WhatsApp não informado."
        );

        erro.statusCode = 400;
        throw erro;
    }

    const { data: existentes, error: erroBusca } =
        await supabase
            .from("visitantes")
            .select("*")
            .eq("telefone", telefoneNormalizado)
            .order("ultima_visita", {
                ascending: false,
                nullsFirst: false
            })
            .limit(1);

    if (erroBusca) {
        throw erroBusca;
    }

    const existente = Array.isArray(existentes)
        ? existentes[0]
        : null;

    if (!existente) {
        return criarVisitante({
            nome:
                nomeNormalizado ||
                "Contato do WhatsApp",
            telefone: telefoneNormalizado,
            status: "novo"
        });
    }

    const atualizacao = {
        ultima_visita: new Date().toISOString()
    };

    if (!existente.nome && nomeNormalizado) {
        atualizacao.nome = nomeNormalizado;
    }

    const { data, error } = await supabase
        .from("visitantes")
        .update(atualizacao)
        .eq(
            "visitante_id",
            existente.visitante_id
        )
        .select("*")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

// ======================================================
// EXPORTAÇÕES
// ======================================================

module.exports = {
    listarVisitantes,
    criarVisitante,
    atualizarVisitante,
    buscarVisitanteTracker,
    criarVisitanteTracker,
    atualizarVisitanteTracker,
    registrarContatoWhatsApp
};
