'use strict';
const { periodo } = require('./estoque');
const { hojeBrasil } = require('../public/aniversarios');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const falha = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });
function texto(valor, maximo, obrigatorio = false) {
    const limpo = String(valor ?? '').trim();
    if (limpo.length > maximo || /\p{Cc}/u.test(limpo.replace(/[\r\n]/g, '')) || obrigatorio && !limpo) throw falha('Confira os campos informados.');
    return limpo || null;
}
function dataValida(valor) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(valor)) && Number.isFinite(Date.parse(valor + 'T12:00:00Z')) && new Date(valor + 'T12:00:00Z').toISOString().slice(0, 10) === valor;
}
function despesa(dados) {
    if (!UUID.test(dados.id)) throw falha('Identificador inválido. Atualize a página.');
    if (!['compra', 'despesa'].includes(dados.tipo)) throw falha('Escolha o tipo do gasto.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(String(dados.valor)) || Number(dados.valor) <= 0 || Number(dados.valor) > 1000000) throw falha('Informe um valor válido.');
    if (!dataValida(dados.data_pagamento) || dados.data_pagamento > hojeBrasil()) throw falha('Informe a data do pagamento, até hoje.');
    if (dados.validade && !dataValida(dados.validade)) throw falha('Confira a validade.');
    const quantidade = dados.quantidade === '' || dados.quantidade == null ? null : String(dados.quantidade);
    if (quantidade !== null && (!/^\d{1,8}(\.\d{1,3})?$/.test(quantidade) || Number(quantidade) <= 0)) throw falha('Confira a quantidade comprada.');
    return {
        tipo: dados.tipo,
        descricao: texto(dados.descricao, 200, true),
        categoria: texto(dados.categoria, 60, true),
        valor: Number(dados.valor),
        data_pagamento: dados.data_pagamento,
        quantidade: dados.tipo === 'compra' && quantidade !== null ? Number(quantidade) : null,
        unidade: dados.tipo === 'compra' ? texto(dados.unidade, 30) : null,
        fornecedor: texto(dados.fornecedor, 120),
        lote: dados.tipo === 'compra' ? texto(dados.lote, 120) : null,
        validade: dados.tipo === 'compra' ? dados.validade || null : null,
        observacao: texto(dados.observacao, 1000)
    };
}
function criarServico(db) {
    async function rpc(nome, args) {
        const { data, error } = await db.rpc(nome, args);
        if (error) {
            if (error.code === 'P0001') throw falha(error.message, 409);
            if (['23514', '22P02', '22007', '22008'].includes(error.code)) throw falha('Confira os valores e as datas.');
            throw falha('Não foi possível atualizar o caixa. Tente novamente.', 503);
        }
        return data;
    }
    return {
        painel(q) {
            const { inicio, fim } = periodo(q.mes || hojeBrasil().slice(0, 7));
            if (!/^\d{1,6}$/.test(String(q.pagina ?? 0)) || !['gastos', 'entradas'].includes(q.tipo || 'gastos')) throw falha('Consulta inválida.');
            const busca = String(texto(q.busca, 120) || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[%_\\]/g, '');
            return rpc('kahenna_caixa_painel', { p_inicio: inicio, p_fim: fim, p_pagina: Number(q.pagina || 0), p_tipo: q.tipo || 'gastos', p_busca: busca });
        },
        salvar(dados, usuario) {
            if (dados.revisao != null && (!Number.isSafeInteger(dados.revisao) || dados.revisao < 0)) throw falha('Revisão inválida.');
            return rpc('kahenna_caixa_salvar', { p_id: dados.id, p_dados: despesa(dados), p_revisao: dados.revisao ?? null, p_usuario: usuario.id });
        },
        excluir(dados, usuario) {
            if (!UUID.test(dados.id) || !['despesa', 'compra_anterior'].includes(dados.origem) || dados.origem === 'despesa' && (!Number.isSafeInteger(dados.revisao) || dados.revisao < 0)) throw falha('Lançamento inválido.');
            return rpc('kahenna_caixa_excluir', { p_id: dados.id, p_origem: dados.origem, p_revisao: dados.revisao ?? null, p_usuario: usuario.id });
        },
        async taxas() {
            const { data, error } = await db.from('caixa_config').select('taxas,revisao').eq('id', true).single();
            if (error) throw falha('Não foi possível consultar as taxas.', 503);
            return data;
        },
        salvarTaxas(dados, usuario) {
            if (!Number.isSafeInteger(dados.revisao) || dados.revisao < 0 || !dados.taxas || Array.isArray(dados.taxas) || typeof dados.taxas !== 'object') throw falha('Configuração inválida.');
            for (const [chave, valor] of Object.entries(dados.taxas)) {
                if (!/^(maquininha:(visa_mastercard|elo_amex|outras):(debito:1|credito:[1-6])|link:(todas|outras):credito:[1-6])$/.test(chave) || typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100 || Math.abs(valor * 10000 - Math.round(valor * 10000)) > 0.00001) throw falha('Confira as porcentagens das taxas.');
            }
            return rpc('kahenna_caixa_taxas', { p_taxas: dados.taxas, p_revisao: dados.revisao, p_usuario: usuario.id });
        }
    };
}
module.exports = { criarServico, despesa };
