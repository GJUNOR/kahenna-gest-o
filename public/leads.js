"use strict";

// ======================================================
// ATLAS CRM — LEADS / PACIENTES
// ======================================================

const API_LEADS = "/api/leads";

let todosOsLeads = [];
let leadsFiltrados = [];
let leadSelecionado = null;
let leadEmEdicao = null;
let leadIdentificacaoEmEdicao = null;
let atualizacaoAutomatica = null;
let atualizandoEmSegundoPlano = false;
let idsMovimentacaoFinanceiraHoje = new Set();
let movimentacoesFinanceirasHojePorPaciente = new Map();
let exibindoFinanceiroHoje = false;

const INTERVALO_ATUALIZACAO = 5000;


// ======================================================
// INICIALIZAÇÃO
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Atlas CRM: leads.js carregado.");

    configurarEventos();

    await carregarMovimentacoesFinanceirasHoje();

    await carregarLeads();

    iniciarAtualizacaoAutomatica();

    agendarViradaDoDia();
});

// ======================================================
// ELEMENTOS DO HTML
// ======================================================

function obterElemento(id) {
    return document.getElementById(id);
}

function encontrarElemento(...seletores) {
    for (const seletor of seletores) {
        const elemento = document.querySelector(seletor);

        if (elemento) {
            return elemento;
        }
    }

    return null;
}

function obterCorpoTabela() {
    return encontrarElemento(
        "#tabelaPacientes tbody",
        "#tabelaLeads tbody",
        "table tbody"
    );
}

function obterCampoBusca() {
    return encontrarElemento(
        "#pesquisa",
        "#busca",
        "#campoBusca",
        "#searchInput",
        "#inputBusca",
        "input[type='search']"
    );
}

// ======================================================
// CONFIGURAÇÃO DOS EVENTOS
// ======================================================

function configurarEventos() {
    configurarBusca();
    configurarFiltros();
    configurarDrawer();
    configurarModalEdicao();
    configurarBotoesSuperiores();
    configurarModalNovoPaciente();
}


function configurarBotoesSuperiores() {
    const botaoAtualizar =
        document.getElementById("btnAtualizar");

    const botaoNovoPaciente =
        document.getElementById("btnNovoPaciente");

    if (botaoAtualizar) {
        botaoAtualizar.addEventListener(
            "click",
            atualizarPaginaSemReload
        );
    }

    if (botaoNovoPaciente) {
        botaoNovoPaciente.addEventListener(
            "click",
            abrirModalNovoPaciente
        );
    }
}

async function atualizarPaginaSemReload() {
    const botao =
        document.getElementById("btnAtualizar");

    definirBotaoCarregandoAtualizacao(
        botao,
        true
    );

    try {
        const resposta = await fetch(
            `${API_LEADS}?t=${Date.now()}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                },
                cache: "no-store"
            }
        );

        if (!resposta.ok) {
            const mensagem =
                await lerMensagemDeErro(resposta);

            throw new Error(
                mensagem ||
                "Não foi possível atualizar os pacientes."
            );
        }

        const retorno = await resposta.json();

        todosOsLeads =
            normalizarResposta(retorno);

        await carregarMovimentacoesFinanceirasHoje();

        aplicarFiltros();
        atualizarIndicadores(todosOsLeads);
        atualizarContador(leadsFiltrados.length);
        atualizarDrawerAberto();

        mostrarMensagem(
            "Dados atualizados com sucesso.",
            "sucesso"
        );
    } catch (erro) {
        console.error(
            "Erro ao atualizar os dados:",
            erro
        );

        mostrarMensagem(
            erro.message ||
            "Não foi possível atualizar os dados.",
            "erro"
        );
    } finally {
        definirBotaoCarregandoAtualizacao(
            botao,
            false
        );
    }
}

function definirBotaoCarregandoAtualizacao(
    botao,
    carregando
) {
    if (!botao) {
        return;
    }

    if (carregando) {
        if (!botao.dataset.conteudoOriginal) {
            botao.dataset.conteudoOriginal =
                botao.innerHTML;
        }

        botao.disabled = true;

        botao.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Atualizando...
        `;

        return;
    }

    botao.disabled = false;

    if (botao.dataset.conteudoOriginal) {
        botao.innerHTML =
            botao.dataset.conteudoOriginal;
    }
}

function configurarModalNovoPaciente() {
    const modal =
        document.getElementById(
            "modalNovoPacienteOverlay"
        );

    const botaoFechar =
        document.getElementById(
            "fecharModalNovoPaciente"
        );

    const botaoCancelar =
        document.getElementById(
            "cancelarNovoPaciente"
        );

    const botaoSalvar =
        document.getElementById(
            "salvarNovoPaciente"
        );

    if (botaoFechar) {
        botaoFechar.addEventListener(
            "click",
            fecharModalNovoPaciente
        );
    }

    if (botaoCancelar) {
        botaoCancelar.addEventListener(
            "click",
            fecharModalNovoPaciente
        );
    }

    if (botaoSalvar) {
        botaoSalvar.addEventListener(
            "click",
            cadastrarNovoPaciente
        );
    }

    if (modal) {
        modal.addEventListener(
            "click",
            (evento) => {
                if (evento.target === modal) {
                    fecharModalNovoPaciente();
                }
            }
        );
    }
}

function abrirModalNovoPaciente() {
    const modal =
        document.getElementById(
            "modalNovoPacienteOverlay"
        );

    const campoNome =
        document.getElementById(
            "novoPacienteNome"
        );

    const campoTelefone =
        document.getElementById(
            "novoPacienteTelefone"
        );

    const campoOrigem =
        document.getElementById(
            "novoPacienteOrigem"
        );

    if (
        !modal ||
        !campoNome ||
        !campoTelefone ||
        !campoOrigem
    ) {
        console.error(
            "Modal de novo paciente não encontrado."
        );

        return;
    }

    campoNome.value = "";
    campoTelefone.value = "";
    campoOrigem.value = "";
    definirValor("novoPacienteNascimento", "");

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add(
        "modal-edicao-aberto"
    );

    window.setTimeout(() => {
        campoNome.focus();
    }, 50);
}

function fecharModalNovoPaciente() {
    const modal =
        document.getElementById(
            "modalNovoPacienteOverlay"
        );

    if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    document.body.classList.remove(
        "modal-edicao-aberto"
    );
}

async function cadastrarNovoPaciente() {
    const nome = obterValorElemento(
        "novoPacienteNome"
    );

    const telefone = obterValorElemento(
        "novoPacienteTelefone"
    );

    const origem = obterValorElemento(
        "novoPacienteOrigem"
    );

    if (!nome) {
        mostrarMensagem(
            "Informe o nome do paciente.",
            "erro"
        );

        return;
    }

    if (!telefone) {
        mostrarMensagem(
            "Informe o telefone do paciente.",
            "erro"
        );

        return;
    }

    if (!origem) {
        mostrarMensagem(
            "Selecione como o paciente conheceu a clínica.",
            "erro"
        );

        return;
    }

    const numerosTelefone =
        telefone.replace(/\D/g, "");

    if (
        numerosTelefone.length !== 10 &&
        numerosTelefone.length !== 11 &&
        numerosTelefone.length !== 12 &&
        numerosTelefone.length !== 13
    ) {
        mostrarMensagem(
            "Informe um telefone válido.",
            "erro"
        );

        return;
    }

    const botaoSalvar =
        document.getElementById(
            "salvarNovoPaciente"
        );

    definirBotaoCarregando(
        botaoSalvar,
        true
    );

    try {
        const resposta = await fetch(
            API_LEADS,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    nome,
                    telefone,
                    status: "novo",
                    data_nascimento: obterValorElemento("novoPacienteNascimento"),
                    origem
                })
            }
        );

        if (!resposta.ok) {
            const mensagem =
                await lerMensagemDeErro(resposta);

            throw new Error(
                mensagem ||
                "Não foi possível cadastrar o paciente."
            );
        }

        const retorno =
            await resposta.json();

        const novoPaciente =
            retorno.data ||
            retorno.paciente ||
            retorno.visitante ||
            retorno;

        if (
            novoPaciente &&
            typeof novoPaciente === "object"
        ) {
            todosOsLeads = [
                novoPaciente,
                ...todosOsLeads
            ];

            aplicarFiltros();
            atualizarIndicadores(todosOsLeads);
            atualizarContador(
                leadsFiltrados.length
            );
        } else {
            await atualizarPaginaSemReload();
        }

        fecharModalNovoPaciente();

        mostrarMensagem(
            "Paciente cadastrado com sucesso.",
            "sucesso"
        );
    } catch (erro) {
        console.error(
            "Erro cadastrando paciente:",
            erro
        );

        mostrarMensagem(
            erro.message ||
            "Não foi possível cadastrar o paciente.",
            "erro"
        );
    } finally {
        definirBotaoCarregando(
            botaoSalvar,
            false
        );
    }
}


// ======================================================
// CARREGAMENTO DOS LEADS
// ======================================================

async function carregarLeads() {
    mostrarCarregamento();

    try {
        const resposta = await fetch(API_LEADS, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        });

        if (!resposta.ok) {
            const mensagem = await lerMensagemDeErro(resposta);

            throw new Error(
                mensagem ||
                `Erro HTTP ${resposta.status} ao carregar pacientes.`
            );
        }

        const retorno = await resposta.json();

        todosOsLeads = normalizarResposta(retorno);
        leadsFiltrados = [...todosOsLeads];



        renderizarTudo();
    } catch (erro) {
        console.error("Erro ao carregar pacientes:", erro);

        mostrarErroNaTabela(
            erro.message || "Não foi possível carregar os pacientes."
        );
    }
}

function iniciarAtualizacaoAutomatica() {
    if (atualizacaoAutomatica) {
        clearInterval(atualizacaoAutomatica);
    }

    atualizacaoAutomatica = setInterval(() => {
        carregarLeadsEmSegundoPlano();
    }, INTERVALO_ATUALIZACAO);

    console.log(
        `Atualização automática iniciada a cada ${
            INTERVALO_ATUALIZACAO / 1000
        } segundos.`
    );
}

async function carregarLeadsEmSegundoPlano() {
    if (atualizandoEmSegundoPlano) {
        return;
    }

    atualizandoEmSegundoPlano = true;

    try {
        const resposta = await fetch(API_LEADS, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        if (!resposta.ok) {
            throw new Error(
                `Erro HTTP ${resposta.status}`
            );
        }

        const retorno = await resposta.json();
        const novosDados = normalizarResposta(retorno);

        if (!houveAlteracaoNosLeads(novosDados)) {
            return;
        }

        const quantidadeAnterior =
            todosOsLeads.length;

        todosOsLeads = novosDados;

        aplicarFiltros();

        atualizarIndicadores(todosOsLeads);
        atualizarContador(leadsFiltrados.length);

        if (
            novosDados.length >
            quantidadeAnterior
        ) {
            const quantidadeNovos =
                novosDados.length -
                quantidadeAnterior;

            mostrarMensagem(
                `${quantidadeNovos} novo${
                    quantidadeNovos === 1 ? "" : "s"
                } paciente${
                    quantidadeNovos === 1 ? "" : "s"
                } recebido${
                    quantidadeNovos === 1 ? "" : "s"
                }.`,
                "sucesso"
            );
        }

        atualizarDrawerAberto();

        console.log(
            "Pacientes atualizados automaticamente."
        );
    } catch (erro) {
        console.warn(
            "Falha na atualização automática:",
            erro.message
        );
    } finally {
        atualizandoEmSegundoPlano = false;
    }
}

function houveAlteracaoNosLeads(novosDados) {
    if (!Array.isArray(novosDados)) {
        return false;
    }

    if (
        novosDados.length !==
        todosOsLeads.length
    ) {
        return true;
    }

    const estadoAtual =
        criarAssinaturaDosLeads(todosOsLeads);

    const novoEstado =
        criarAssinaturaDosLeads(novosDados);

    return estadoAtual !== novoEstado;
}

function criarAssinaturaDosLeads(leads) {
    return JSON.stringify(
        leads.map((lead) => ({
            visitante_id: lead.visitante_id,
            nome: lead.nome,
            telefone: lead.telefone,
            status: lead.status,
            ultima_visita: lead.ultima_visita,
            total_visitas: lead.total_visitas,
            total_conversoes: lead.total_conversoes
        }))
    );
}

function atualizarDrawerAberto() {
    if (!leadSelecionado) {
        return;
    }

    const visitanteId =
        obterIdLead(leadSelecionado);

    const leadAtualizado =
        todosOsLeads.find((lead) => {
            return (
                String(obterIdLead(lead)) ===
                String(visitanteId)
            );
        });

    if (!leadAtualizado) {
        return;
    }

    leadSelecionado = leadAtualizado;

    const drawer =
        document.getElementById(
            "patientDrawer"
        );

    if (
        drawer &&
        drawer.classList.contains("open")
    ) {
        preencherDrawer(leadAtualizado);
    }
}

function atualizarLeadLocal(
    visitanteId,
    dadosRecebidos,
    retornoApi
) {
    let dadosAtualizados = dadosRecebidos;

    if (
        retornoApi &&
        typeof retornoApi === "object"
    ) {
        if (
            retornoApi.data &&
            typeof retornoApi.data === "object"
        ) {
            dadosAtualizados = {
                ...dadosRecebidos,
                ...retornoApi.data
            };
        } else {
            dadosAtualizados = {
                ...dadosRecebidos,
                ...retornoApi
            };
        }
    }

    todosOsLeads = todosOsLeads.map(
        (lead) => {
            if (
                String(obterIdLead(lead)) !==
                String(visitanteId)
            ) {
                return lead;
            }

            return {
                ...lead,
                ...dadosAtualizados
            };
        }
    );

    const leadAtualizado =
        todosOsLeads.find((lead) => {
            return (
                String(obterIdLead(lead)) ===
                String(visitanteId)
            );
        });

    if (leadAtualizado) {
        leadSelecionado = leadAtualizado;
    }

    aplicarFiltros();
    atualizarIndicadores(todosOsLeads);
    atualizarContador(leadsFiltrados.length);
}



function normalizarResposta(retorno) {
    if (Array.isArray(retorno)) {
        return retorno;
    }

    if (retorno && Array.isArray(retorno.data)) {
        return retorno.data;
    }

    if (retorno && Array.isArray(retorno.leads)) {
        return retorno.leads;
    }

    if (retorno && Array.isArray(retorno.visitantes)) {
        return retorno.visitantes;
    }

    if (retorno && Array.isArray(retorno.pacientes)) {
        return retorno.pacientes;
    }

    console.warn(
        "Nenhum array de pacientes foi encontrado na resposta:",
        retorno
    );

    return [];
}

// ======================================================
// RENDERIZAÇÃO GERAL
// ======================================================

function renderizarTudo() {
    renderizarTabela(leadsFiltrados);
    atualizarIndicadores(todosOsLeads);
    atualizarContador(leadsFiltrados.length);
    atualizarAvaliacoesHoje();
}

function atualizarContador(quantidade) {
    const elemento =
        document.getElementById("contadorPacientes");

    if (!elemento) {
        console.warn(
            "Elemento #contadorPacientes não encontrado no HTML."
        );

        return;
    }

    const total =
        Number.isFinite(Number(quantidade))
            ? Number(quantidade)
            : 0;

    elemento.textContent =
        `${total} paciente${total === 1 ? "" : "s"}`;
}

function atualizarIndicadores(leads) {
    const lista = Array.isArray(leads)
        ? leads
        : [];

    let novosHoje = 0;
    let emAtendimentoHoje = 0;
    let receitaHoje = 0;
    let receitaMes = 0;

    const agora = new Date();

    const inicioHoje = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        0,
        0,
        0,
        0
    );

    const fimHoje = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        23,
        59,
        59,
        999
    );

    const inicioMes = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        1,
        0,
        0,
        0,
        0
    );

    const fimMes = new Date(
        agora.getFullYear(),
        agora.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
    );

    lista.forEach((lead) => {
        const status = normalizarStatus(
            obterStatusLead(lead)
        );

        const dataCadastro = converterData(
            obterPrimeiroValor(
                lead.criado_em,
                lead.created_at,
                lead.primeira_visita,
                lead.data_criacao
            )
        );

        if (
            dataCadastro &&
            dataEstaNoIntervalo(
                dataCadastro,
                inicioHoje,
                fimHoje
            )
        ) {
            novosHoje += 1;
        }

        const dataAtendimento = converterData(
            obterPrimeiroValor(
                lead.inicio_atendimento,
                lead.atendimento_em,
                lead.data_atendimento,
                lead.updated_at,
                lead.ultima_visita
            )
        );

        const estaEmAtendimento = [
            "em atendimento",
            "atendimento",
            "em contato",
            "contato iniciado",
            "aguardando atendimento",
            "em negociacao",
            "negociacao"
        ].includes(status);

        if (
            estaEmAtendimento &&
            dataAtendimento &&
            dataEstaNoIntervalo(
                dataAtendimento,
                inicioHoje,
                fimHoje
            )
        ) {
            emAtendimentoHoje += 1;
        }

        const valorConversao =
            converterValorNumerico(
                obterPrimeiroValor(
                    lead.valor_conversao,
                    lead.valor,
                    lead.receita,
                    lead.valor_venda
                )
            ) || 0;

        const dataConversao = converterData(
            obterPrimeiroValor(
                lead.data_conversao,
                lead.convertido_em,
                lead.ultima_conversao,
                lead.data_pagamento,
                lead.pagamento_em
            )
        );

        if (
            valorConversao > 0 &&
            dataConversao
        ) {
            if (
                dataEstaNoIntervalo(
                    dataConversao,
                    inicioHoje,
                    fimHoje
                )
            ) {
                receitaHoje += valorConversao;
            }

            if (
                dataEstaNoIntervalo(
                    dataConversao,
                    inicioMes,
                    fimMes
                )
            ) {
                receitaMes += valorConversao;
            }
        }
    });

    definirTexto(
        "novosHoje",
        novosHoje
    );

    definirTexto(
        "emAtendimento",
        emAtendimentoHoje
    );

    definirTexto(
        "receitaHoje",
        formatarMoeda(receitaHoje)
    );

    definirTexto(
        "receitaMes",
        formatarMoeda(receitaMes)
    );
atualizarResumoReceita();
}

async function abrirModalEdicao(lead) {
    if (!lead) {
        mostrarMensagem(
            "Não foi possível localizar o paciente.",
            "erro"
        );
        return;
    }

    leadEmEdicao = lead;

    definirTexto(
        "tituloModalEdicao",
        `Financeiro — ${obterPrimeiroValor(lead.nome, "Paciente")}`
    );

    const modal =
        obterElemento("modalEdicaoOverlay");

    if (!modal) {
        return;
    }

    definirValor(
        "editarNomePaciente",
        obterPrimeiroValor(lead.nome, "")
    );

    definirValor(
        "editarTelefonePaciente",
        obterPrimeiroValor(lead.telefone, "")
    );

    definirValor(
        "editarOrigemPaciente",
        ""
    );

    definirValor(
        "editarStatusPaciente",
        normalizarValorSelect(
            obterStatusLead(lead)
        )
    );

    definirValor(
        "editarDataAvaliacao",
        formatarDataParaInput(
            obterPrimeiroValor(
                lead.data_avaliacao,
                lead.data_agendamento,
                lead.agendado_para,
                ""
            )
        )
    );

    definirValor(
        "editarValorConversao",
        formatarValorParaInput(
            obterPrimeiroValor(
                lead.valor_conversao,
                lead.valor,
                ""
            )
        )
    );

    atualizarCamposCondicionaisEdicao();

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add(
        "modal-edicao-aberto"
    );

    window.setTimeout(() => {
        obterElemento(
            "editarNomePaciente"
        )?.focus();
    }, 50);

    const visitanteId =
        obterIdLead(lead);

    if (!visitanteId) {
        return;
    }

    carregarFinanceiroPaciente().catch((erro) => {
        mostrarFeedbackFinanceiro(
            erro.message || "Não foi possível carregar o histórico financeiro.",
            "erro"
        );
    });

    try {
        const resposta = await fetch(
            `/api/conversoes/paciente/${encodeURIComponent(
                visitanteId
            )}?t=${Date.now()}`,
            {
                headers: {
                    Accept: "application/json"
                },
                cache: "no-store"
            }
        );

        if (!resposta.ok) {
            return;
        }

        const retorno =
            await resposta.json();

        const conversao =
            retorno.dados || null;

        if (conversao) {
            definirValor(
                "editarValorConversao",
                formatarValorParaInput(
                    conversao.valor
                )
            );

        }
    } catch (erro) {
        console.warn(
            "Não foi possível carregar a conversão:",
            erro
        );
    }

    try {
        const resposta = await fetch(
            `/api/agendamentos/paciente/${encodeURIComponent(
                visitanteId
            )}?t=${Date.now()}`,
            {
                headers: {
                    Accept: "application/json"
                },
                cache: "no-store"
            }
        );

        if (!resposta.ok) {
            return;
        }

        const retorno =
            await resposta.json();

        const agendamento =
            retorno.data || null;

        if (!agendamento) {
            return;
        }

        definirValor(
            "editarDataAvaliacao",
            formatarDataParaInput(
                agendamento.data_avaliacao
            )
        );

    } catch (erro) {
        console.warn(
            "Não foi possível carregar o agendamento:",
            erro
        );
    }
}

function fecharModalEdicao() {
    const modal =
        obterElemento("modalEdicaoOverlay");

    if (modal) {
        modal.classList.remove("open");
        modal.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    document.body.classList.remove(
        "modal-edicao-aberto"
    );

    leadEmEdicao = null;
}

function atualizarCamposCondicionaisEdicao() {
    const status = normalizarStatus(
        obterValorElemento(
            "editarStatusPaciente"
        )
    );

    const grupoAvaliacao =
        obterElemento(
            "grupoEditarDataAvaliacao"
        );

    const grupoConversao =
        obterElemento(
            "grupoEditarValorConversao"
        );

    if (grupoAvaliacao) {
        grupoAvaliacao.hidden =
            status !== "agendado";
    }

    if (grupoConversao) {
        grupoConversao.hidden =
            status !== "convertido";
    }
}

function formatarDataParaInput(valor) {
    const data = converterData(valor);

    if (!data) {
        return "";
    }

    const compensacao =
        data.getTimezoneOffset() * 60000;

    return new Date(
        data.getTime() - compensacao
    )
        .toISOString()
        .slice(0, 16);
}

async function salvarConversaoDoPaciente(
    visitanteId,
    valor,
    observacao
) {
    const resposta = await fetch(
        `/api/conversoes/paciente/${encodeURIComponent(
            visitanteId
        )}`,
        {
            method: "PUT",
            headers: {
                "Content-Type":
                    "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                valor,
                observacao
            })
        }
    );

    if (!resposta.ok) {
        const mensagem =
            await lerMensagemDeErro(resposta);

        throw new Error(
            mensagem ||
            "Não foi possível salvar a conversão."
        );
    }

    return resposta.json();
}

async function salvarAgendamentoDaEdicao(
    visitanteId,
    dataAvaliacao,
    observacao
) {
    const resposta = await fetch(
        "/api/agendamentos",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                visitante_id: visitanteId,
                data_avaliacao:
                    new Date(
                        dataAvaliacao
                    ).toISOString(),
                observacao:
                    observacao || null
            })
        }
    );

    if (!resposta.ok) {
        const mensagem =
            await lerMensagemDeErro(resposta);

        throw new Error(
            mensagem ||
            "Não foi possível salvar o agendamento."
        );
    }

    return resposta.json();
}

async function salvarEdicaoRapida() {
    if (!leadEmEdicao) {
        mostrarMensagem(
            "Nenhum paciente selecionado.",
            "erro"
        );
        return;
    }

    const id =
        obterIdLead(leadEmEdicao);

    const nome =
        obterValorElemento(
            "editarNomePaciente"
        );

    const telefone =
        obterValorElemento(
            "editarTelefonePaciente"
        );

    const status =
        obterValorElemento(
            "editarStatusPaciente"
        );

    const origem =
        obterValorElemento(
            "editarOrigemPaciente"
        );

    const dataAvaliacao =
        obterValorElemento(
            "editarDataAvaliacao"
        );

    const statusNormalizado =
        normalizarStatus(status);

    if (!id || !nome || !telefone) {
        mostrarMensagem(
            "Informe nome e telefone do paciente.",
            "erro"
        );
        return;
    }

    if (
        statusNormalizado === "agendado" &&
        !dataAvaliacao
    ) {
        mostrarMensagem(
            "Informe a data da avaliação.",
            "erro"
        );
        return;
    }

    const botaoSalvar =
        obterElemento("salvarStatusFinanceiro") ||
        obterElemento("salvarEdicaoPaciente");

    definirBotaoCarregando(
        botaoSalvar,
        true
    );

    fecharModalEdicao();

    try {
        const dadosPaciente = {
            nome,
            telefone,
            status
        };

        if (origem) {
            dadosPaciente.origem = origem;
        }

        const resposta = await fetch(
            `${API_LEADS}/${encodeURIComponent(id)}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type":
                        "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify(
                    dadosPaciente
                )
            }
        );

        if (!resposta.ok) {
            const mensagem =
                await lerMensagemDeErro(resposta);

            throw new Error(
                mensagem ||
                "Não foi possível editar o paciente."
            );
        }

        const retorno =
            await resposta.json();

        if (statusNormalizado === "agendado") {
            await salvarAgendamentoDaEdicao(
                id,
                dataAvaliacao,
                null
            );
        }

        const dadosLocais = {
            ...dadosPaciente
        };

        if (
            statusNormalizado ===
            "agendado"
        ) {
            dadosLocais.data_avaliacao =
                new Date(
                    dataAvaliacao
                ).toISOString();
        }

        atualizarLeadLocal(
            id,
            dadosLocais,
            retorno
        );

        await Promise.all([
            atualizarResumoReceita(),
            atualizarAvaliacoesHoje()
        ]);

        mostrarMensagem(
            "Paciente atualizado com sucesso.",
            "sucesso"
        );
    } catch (erro) {
        console.error(
            "Erro editando paciente:",
            erro
        );

        mostrarMensagem(
            erro.message ||
            "Não foi possível editar o paciente.",
            "erro"
        );
    } finally {
        definirBotaoCarregando(
            botaoSalvar,
            false
        );
    }
}

function abrirModalIdentificacao(lead) {
    if (!lead) return;
    leadIdentificacaoEmEdicao = lead;
    definirValor("editarNomeIdentificacao", obterPrimeiroValor(lead.nome, ""));
    definirValor("editarTelefoneIdentificacao", obterPrimeiroValor(lead.telefone, ""));
    definirValor("editarNascimentoIdentificacao", lead.data_nascimento || "");

    const modal = obterElemento("modalIdentificacaoOverlay");
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-edicao-aberto");
    window.setTimeout(() => obterElemento("editarNomeIdentificacao")?.focus(), 50);
}

function fecharModalIdentificacao() {
    const modal = obterElemento("modalIdentificacaoOverlay");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-edicao-aberto");
    leadIdentificacaoEmEdicao = null;
}

async function salvarIdentificacaoPaciente() {
    if (!leadIdentificacaoEmEdicao) return;

    const id = obterIdLead(leadIdentificacaoEmEdicao);
    const nome = obterValorElemento("editarNomeIdentificacao");
    const telefone = obterValorElemento("editarTelefoneIdentificacao");
    if (!id || !nome || !telefone) {
        mostrarMensagem("Informe nome e telefone do paciente.", "erro");
        return;
    }

    const botao = obterElemento("salvarIdentificacaoPaciente");
    definirBotaoCarregando(botao, true);
    try {
        const resposta = await fetch(`${API_LEADS}/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ nome, telefone, data_nascimento: obterValorElemento("editarNascimentoIdentificacao") })
        });
        if (!resposta.ok) {
            throw new Error(await lerMensagemDeErro(resposta) || "Não foi possível editar o paciente.");
        }

        const retorno = await resposta.json();
        atualizarLeadLocal(id, { nome, telefone, data_nascimento: obterValorElemento("editarNascimentoIdentificacao") || null }, retorno);
        fecharModalIdentificacao();
        mostrarMensagem("Cadastro atualizado com sucesso.", "sucesso");
    } catch (erro) {
        mostrarMensagem(erro.message || "Não foi possível editar o paciente.", "erro");
    } finally {
        definirBotaoCarregando(botao, false);
    }
}

function configurarModalEdicao() {
    const modal =
        obterElemento("modalEdicaoOverlay");

    const botaoFechar =
        obterElemento("fecharModalEdicao");

    const botaoCancelar =
        obterElemento(
            "cancelarEdicaoPaciente"
        );

    const botaoSalvar =
        obterElemento(
            "salvarEdicaoPaciente"
        );

    const campoStatus =
        obterElemento(
            "editarStatusPaciente"
        );

    botaoFechar?.addEventListener(
        "click",
        fecharModalEdicao
    );

    botaoCancelar?.addEventListener(
        "click",
        fecharModalEdicao
    );

    botaoSalvar?.addEventListener(
        "click",
        salvarEdicaoRapida
    );

    obterElemento("salvarStatusFinanceiro")?.addEventListener(
        "click",
        salvarEdicaoRapida
    );

    campoStatus?.addEventListener(
        "change",
        atualizarCamposCondicionaisEdicao
    );

    obterElemento("fecharModalIdentificacao")?.addEventListener("click", fecharModalIdentificacao);
    obterElemento("cancelarIdentificacaoPaciente")?.addEventListener("click", fecharModalIdentificacao);
    obterElemento("salvarIdentificacaoPaciente")?.addEventListener("click", salvarIdentificacaoPaciente);
    obterElemento("modalIdentificacaoOverlay")?.addEventListener("click", (evento) => {
        if (evento.target.id === "modalIdentificacaoOverlay") fecharModalIdentificacao();
    });

    obterElemento("financeiroPagamentoPacote")?.addEventListener("change", atualizarOpcoesPacote);
    obterElemento("financeiroPacote")?.addEventListener("change", atualizarOpcoesPacote);
    obterElemento("financeiroParcelas")?.addEventListener("change", atualizarValorPacote);
    obterElemento("registrarAvaliacao")?.addEventListener("click", registrarAvaliacaoFinanceira);
    obterElemento("registrarPacote")?.addEventListener("click", registrarPacoteFinanceiro);
    atualizarOpcoesPacote();

    modal?.addEventListener(
        "click",
        (evento) => {
            if (evento.target === modal) {
                fecharModalEdicao();
            }
        }
    );

    document.addEventListener(
        "keydown",
        (evento) => {
            if (
                evento.key === "Escape" &&
                modal?.classList.contains("open")
            ) {
                fecharModalEdicao();
            }
        }
    );
}

const TABELA_PACOTES = {
    5: { vista: 1500, parcelado: 1650, max: 6 },
    10: { vista: 2500, parcelado: 3000, max: 10 },
    20: { vista: 4500, parcelado: 5000, max: 10 }
};

function atualizarOpcoesPacote() {
    const forma = obterValorElemento("financeiroPagamentoPacote");
    const sessoes = Number(obterValorElemento("financeiroPacote"));
    const grupo = obterElemento("grupoParcelasFinanceiro");
    const select = obterElemento("financeiroParcelas");
    const credito = forma === "credito";
    if (!grupo) return;
    grupo.hidden = !credito;
    if (credito && select) {
        const atual = Number(select.value || 1);
        select.innerHTML = "";
        for (let parcela = 1; parcela <= TABELA_PACOTES[sessoes].max; parcela += 1) {
            select.add(new Option(`${parcela}x`, String(parcela)));
        }
        select.value = String(Math.min(atual, TABELA_PACOTES[sessoes].max));
    }
    atualizarValorPacote();
}

function atualizarValorPacote() {
    const sessoes = Number(obterValorElemento("financeiroPacote"));
    const forma = obterValorElemento("financeiroPagamentoPacote");
    const parcelas = Number(obterValorElemento("financeiroParcelas") || 1);
    const pacote = TABELA_PACOTES[sessoes];
    const valor = forma === "credito" && parcelas > 1 ? pacote.parcelado : pacote.vista;
    definirTexto("financeiroValorPacote", formatarMoeda(valor));
}

function mostrarFeedbackFinanceiro(texto, tipo = "sucesso") {
    const feedback = obterElemento("financeiroFeedback");
    if (!feedback) return;
    feedback.textContent = texto;
    feedback.className = `financeiro-feedback ${tipo}`;
    feedback.hidden = false;
}

function definirCarregamentoFinanceiro(botao, carregando) {
    if (!botao) return;
    if (carregando) {
        botao.dataset.textoOriginal = botao.textContent;
        botao.disabled = true;
        botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
    } else {
        botao.disabled = false;
        botao.textContent = botao.dataset.textoOriginal || "Adicionar";
    }
}

async function enviarLancamentoFinanceiro(dados, botao) {
    const visitanteId = obterIdLead(leadEmEdicao);
    if (!visitanteId) throw new Error("Paciente não identificado.");
    definirCarregamentoFinanceiro(botao, true);
    try {
        const resposta = await fetch(`/api/financeiro/paciente/${encodeURIComponent(visitanteId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(dados)
        });
        if (!resposta.ok) throw new Error(await lerMensagemDeErro(resposta));
        const retorno = await resposta.json();
        idsMovimentacaoFinanceiraHoje.add(String(visitanteId));
        atualizarStatusLocal(
            visitanteId,
            retorno.dados?.paciente?.status ||
                obterStatusLead(leadEmEdicao)
        );
        await carregarFinanceiroPaciente();
        atualizarResumoReceita();
        aplicarFiltros();
        mostrarFeedbackFinanceiro("Lançamento registrado e adicionado ao histórico.");
    } finally {
        definirCarregamentoFinanceiro(botao, false);
    }
}

async function registrarAvaliacaoFinanceira() {
    const botao = obterElemento("registrarAvaliacao");
    try {
        await enviarLancamentoFinanceiro({
            tipo: "atendimento",
            descricao: obterValorElemento("financeiroDescricao"),
            valor: lerValorMonetario(obterValorElemento("financeiroValorLivre")),
            forma_pagamento: obterValorElemento("financeiroPagamentoAvaliacao"),
            parcelas: 1,
            observacao: null
        }, botao);
    } catch (erro) { mostrarFeedbackFinanceiro(erro.message || "Não foi possível registrar a avaliação.", "erro"); }
}

async function registrarPacoteFinanceiro() {
    const botao = obterElemento("registrarPacote");
    try {
        await enviarLancamentoFinanceiro({
            tipo: "pacote",
            pacote_sessoes: Number(obterValorElemento("financeiroPacote")),
            forma_pagamento: obterValorElemento("financeiroPagamentoPacote"),
            parcelas: Number(obterValorElemento("financeiroParcelas") || 1),
            observacao: null
        }, botao);
    } catch (erro) { mostrarFeedbackFinanceiro(erro.message || "Não foi possível registrar o pacote.", "erro"); }
}

async function carregarFinanceiroPaciente() {
    const visitanteId = obterIdLead(leadEmEdicao);
    if (!visitanteId) return;
    const resposta = await fetch(`/api/financeiro/paciente/${encodeURIComponent(visitanteId)}?t=${Date.now()}`, { cache: "no-store" });
    if (!resposta.ok) {
        throw new Error(await lerMensagemDeErro(resposta));
    }
    const retorno = await resposta.json();
    definirTexto("financeiroTotalPaciente", formatarMoeda(retorno.total || 0));
    renderizarHistoricoFinanceiro(retorno.lancamentos || []);
}

function renderizarHistoricoFinanceiro(lancamentos) {
    const lista = obterElemento("listaFinanceiroPaciente");
    if (!lista) return;
    if (!lancamentos.length) {
        lista.innerHTML = '<p class="financeiro-vazio">Nenhum lançamento registrado.</p>';
        return;
    }
    lista.innerHTML = lancamentos.map((item) => `
        <article class="financeiro-item ${item.tipo === "reembolso" ? "reembolso" : ""}">
            <div><strong>${escaparHTML(item.descricao)}</strong><small>${formatarData(item.criado_em)} · ${escaparHTML(item.registrado_por_nome || item.registrado_por_email)}</small>${item.observacao ? `<small>${escaparHTML(item.observacao)}</small>` : ""}</div>
            <div><strong>${item.tipo === "reembolso" ? "− " : "+ "}${formatarMoeda(item.valor)}</strong>${item.tipo !== "reembolso" ? `<button type="button" data-reembolsar="${item.id}" data-valor="${item.valor}">Reembolsar</button>` : ""}</div>
        </article>`).join("");
    lista.querySelectorAll("[data-reembolsar]").forEach((botao) => botao.addEventListener("click", () => registrarReembolso(botao)));
}

async function registrarReembolso(botao) {
    const valorTexto = window.prompt("Valor do reembolso:", Number(botao.dataset.valor).toFixed(2).replace(".", ","));
    if (valorTexto === null) return;
    const motivo = window.prompt("Informe o motivo do reembolso (ficará salvo no histórico):");
    if (!motivo) return;
    try {
        const visitanteId = obterIdLead(leadEmEdicao);
        const resposta = await fetch(`/api/financeiro/paciente/${encodeURIComponent(visitanteId)}/reembolsos`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lancamento_id: Number(botao.dataset.reembolsar), valor: converterValorNumerico(valorTexto), observacao: motivo })
        });
        if (!resposta.ok) throw new Error(await lerMensagemDeErro(resposta));
        idsMovimentacaoFinanceiraHoje.add(String(visitanteId));
        await Promise.all([carregarFinanceiroPaciente(), atualizarResumoReceita()]);
        aplicarFiltros();
        mostrarMensagem("Reembolso registrado no histórico.", "sucesso");
    } catch (erro) { mostrarMensagem(erro.message, "erro"); }
}

function renderizarTabela(leads) {
    const tbody = obterCorpoTabela();

    if (!tbody) {
        console.error(
            "O tbody da tabela de pacientes não foi encontrado."
        );

        return;
    }

    tbody.innerHTML = "";

    if (!Array.isArray(leads) || leads.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${exibindoFinanceiroHoje ? 6 : 4}" class="estado-tabela">
                    Nenhum paciente encontrado.
                </td>
            </tr>
        `;

        return;
    }

    leads.forEach((lead) => {
        tbody.appendChild(criarLinhaLead(lead));
    });
}

// ======================================================
// LINHA DA TABELA
// ======================================================

function criarLinhaLead(lead) {
    const tr = document.createElement("tr");

    const id = obterIdLead(lead);

    const nome = obterPrimeiroValor(
        lead.nome,
        lead.name,
        lead.nome_completo,
        lead.paciente,
        "Sem nome"
    );

    const telefone = obterPrimeiroValor(
        lead.telefone,
        lead.phone,
        lead.whatsapp,
        lead.celular,
        "-"
    );

    const origem = formatarOrigem(
        obterPrimeiroValor(
            lead.ultima_utm_source,
            lead.primeira_utm_source,
            "Direto"
        )
    );

    const status = obterStatusLead(lead);

    const movimentacoesHoje =
        movimentacoesFinanceirasHojePorPaciente.get(
            String(id)
        ) || [];

    const colunasFinanceiras = exibindoFinanceiroHoje
        ? criarColunasFinanceirasHoje(movimentacoesHoje)
        : "";

    const dataCriacao = obterPrimeiroValor(
        lead.criado_em,
        lead.primeira_visita,
        null
    );

    const ultimaInteracao = obterPrimeiroValor(
        lead.ultima_visita,
        dataCriacao
    );

    tr.dataset.id = id || "";

    tr.innerHTML = `
        <td>
    <div class="paciente-identificacao">
        <div class="paciente-icones">
            <div class="paciente-avatar" aria-hidden="true">
                <i class="fa-solid fa-user"></i>
            </div>
            <button
                type="button"
                class="btn-editar-identificacao"
                data-id="${escaparAtributo(id)}"
                aria-label="Editar cadastro"
                title="Editar cadastro"
            >
                <i class="fa-solid fa-pen"></i>
            </button>
        </div>

        <div class="paciente-dados">
            <strong>
                ${escaparHTML(nome)}
            </strong>
        </div>
    </div>
</td>

        <td>
            ${escaparHTML(formatarTelefone(telefone))}
        </td>

        <td>
            <span class="origem-lead">
                ${escaparHTML(origem)}
            </span>
        </td>



        ${colunasFinanceiras}

        <td class="coluna-acoes">
            <div class="grupo-acoes-paciente"><button type="button" class="btn-documentos-paciente" data-documentos-paciente="${escaparAtributo(id)}" data-documentos-nome="${escaparAtributo(nome)}" aria-label="Documentos do paciente">PDFs</button><button type="button" class="btn-reminder-paciente" aria-label="Preparar lembrete"><span class="reminder-action-icon"><i class="fa-regular fa-bell" aria-hidden="true"></i></span><span>Lembrete</span></button>

                <button
                    type="button"
                    class="btn-whatsapp-paciente"
                    data-id="${escaparAtributo(id)}"
                    aria-label="Atender pelo WhatsApp"
                    title="Atender pelo WhatsApp"
                >
                    <i class="fa-brands fa-whatsapp"></i>
                    <span>WhatsApp</span>
                </button>

                <button
                    type="button"
                    class="btn-editar-paciente"
                    data-id="${escaparAtributo(id)}"
                    aria-label="Abrir financeiro"
                    title="Abrir financeiro"
                >
                    <i class="fa-solid fa-coins"></i>
                    <span>Financeiro</span>
                </button>

            </div>
        </td>
    `;

    tr.querySelector('.btn-reminder-paciente').addEventListener('click', evento => {
        evento.stopPropagation(); window.abrirLembretePaciente(lead);
    });
    const botaoVisualizar =
        tr.querySelector(".btn-visualizar");

    if (botaoVisualizar) {
        botaoVisualizar.addEventListener(
            "click",
            (evento) => {
                evento.preventDefault();
                evento.stopPropagation();

                abrirLead(id);
            }
        );
    }

const botaoWhatsApp =
    tr.querySelector(".btn-whatsapp-paciente");

if (botaoWhatsApp) {
    botaoWhatsApp.addEventListener(
        "click",
        (evento) => {
            evento.preventDefault();
            evento.stopPropagation();

            abrirWhatsAppEIniciarAtendimento(lead);
        }
    );
}

    const botaoEditar =
        tr.querySelector(".btn-editar-paciente");

    const botaoEditarIdentificacao =
        tr.querySelector(".btn-editar-identificacao");

    botaoEditarIdentificacao?.addEventListener(
        "click",
        (evento) => {
            evento.preventDefault();
            evento.stopPropagation();
            abrirModalIdentificacao(lead);
        }
    );

    if (botaoEditar) {
        botaoEditar.addEventListener(
            "click",
            (evento) => {
                evento.preventDefault();
                evento.stopPropagation();

                abrirModalEdicao(lead);
            }
        );
    }



    return tr;
}

async function abrirWhatsAppEIniciarAtendimento(lead) {
    const url = criarLinkWhatsApp(obterPrimeiroValor(lead.telefone, lead.phone, lead.whatsapp, lead.celular));
    if (!url) return mostrarMensagem("Este paciente não possui um telefone válido.", "erro");
    window.open(url, "_blank", "noopener,noreferrer");
}

function atualizarStatusLocal(visitanteId, novoStatus) {
    todosOsLeads = todosOsLeads.map((lead) => {
        if (
            String(lead.visitante_id) !==
            String(visitanteId)
        ) {
            return lead;
        }

        return {
            ...lead,
            status: novoStatus
        };
    });

    leadsFiltrados = leadsFiltrados.map((lead) => {
        if (
            String(lead.visitante_id) !==
            String(visitanteId)
        ) {
            return lead;
        }

        return {
            ...lead,
            status: novoStatus
        };
    });
}

function criarLinkWhatsApp(telefone) {
    let numeros = String(telefone ?? "")
        .replace(/\D/g, "");

    if (!numeros) {
        return null;
    }

    while (numeros.startsWith("0")) {
        numeros = numeros.slice(1);
    }

    if (
        numeros.length === 10 ||
        numeros.length === 11
    ) {
        numeros = `55${numeros}`;
    }

    if (
        numeros.length !== 12 &&
        numeros.length !== 13
    ) {
        console.error(
            "Telefone inválido:",
            telefone,
            numeros
        );

        return null;
    }

    return `https://wa.me/${numeros}`;
}

// ======================================================
// BUSCA
// ======================================================

function configurarBusca() {
    const campoBusca = obterCampoBusca();

    if (!campoBusca) {
        return;
    }

    campoBusca.addEventListener("input", aplicarFiltros);
}

// ======================================================
// FILTROS
// ======================================================

function configurarFiltros() {
    const filtros = document.querySelectorAll(
        ".filter-chip, .filtro-chip, [data-filter], [data-filtro]"
    );

    filtros.forEach((filtro) => {
        filtro.addEventListener("click", async () => {
            filtros.forEach((item) => {
                item.classList.remove("active", "ativo");
            });

            filtro.classList.add("active", "ativo");

            if (
                normalizarStatus(filtro.dataset.status) ===
                "financeiro hoje"
            ) {
                await carregarMovimentacoesFinanceirasHoje();
            }

            aplicarFiltros();
        });
    });
}

function aplicarFiltros() {
    const termo = normalizarTexto(obterCampoBusca()?.value || "");
    exibindoFinanceiroHoje = false;
    leadsFiltrados = todosOsLeads.filter(lead => [lead.nome, lead.telefone].some(v => normalizarTexto(v || "").includes(termo)));
    renderizarTabela(leadsFiltrados);
    atualizarContador(leadsFiltrados.length);
}

async function carregarMovimentacoesFinanceirasHoje() {
    const agora = new Date();
    const inicio = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        0, 0, 0, 0
    );
    const fim = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate() + 1,
        0, 0, 0, 0
    );

    try {
        const parametros = new URLSearchParams({
            inicio: inicio.toISOString(),
            fim: fim.toISOString()
        });
        const resposta = await fetch(
            `/api/financeiro/movimentacoes-do-dia?${parametros}&t=${Date.now()}`,
            { cache: "no-store" }
        );

        if (!resposta.ok) {
            throw new Error(await lerMensagemDeErro(resposta));
        }

        const retorno = await resposta.json();
        idsMovimentacaoFinanceiraHoje = new Set(
            (retorno.visitante_ids || []).map((id) => String(id))
        );

        movimentacoesFinanceirasHojePorPaciente = new Map();

        (retorno.movimentacoes || []).forEach((item) => {
            const visitanteId = String(
                item.visitante_id || ""
            ).trim();

            if (!visitanteId) return;

            const itens =
                movimentacoesFinanceirasHojePorPaciente.get(
                    visitanteId
                ) || [];

            itens.push(item);
            movimentacoesFinanceirasHojePorPaciente.set(
                visitanteId,
                itens
            );
        });
    } catch (erro) {
        console.warn(
            "Não foi possível atualizar o filtro financeiro:",
            erro.message
        );
    }
}

function atualizarColunasFinanceiroHoje() {
    [
        "cabecalhoResumoFinanceiro",
        "cabecalhoPagamentoFinanceiro"
    ].forEach((id) => {
        const cabecalho = obterElemento(id);

        if (cabecalho) {
            cabecalho.hidden = !exibindoFinanceiroHoje;
        }
    });
}

function criarColunasFinanceirasHoje(movimentacoes) {
    if (!Array.isArray(movimentacoes) || movimentacoes.length === 0) {
        return `
            <td class="resumo-financeiro-hoje">—</td>
            <td class="pagamento-financeiro-hoje">—</td>
        `;
    }

    const resumos = movimentacoes.map((item) => {
        const sinal = item.tipo === "reembolso" ? "−" : "+";

        return `
            <span class="item-resumo-financeiro ${item.tipo === "reembolso" ? "reembolso" : ""}">
                <strong>${escaparHTML(item.descricao || "Movimentação")}</strong>
                <small>${sinal} ${escaparHTML(formatarMoeda(item.valor))}</small>
            </span>
        `;
    }).join("");

    const pagamentos = movimentacoes.map((item) => {
        if (item.tipo === "reembolso") {
            return '<span class="forma-pagamento-hoje reembolso">Reembolso</span>';
        }

        const nomes = {
            pix: "Pix",
            dinheiro: "Dinheiro",
            debito: "Débito",
            credito: "Crédito"
        };
        const forma = nomes[item.forma_pagamento] ||
            item.forma_pagamento || "Não informado";
        const parcelas =
            item.forma_pagamento === "credito"
                ? ` · ${Number(item.parcelas || 1)}x`
                : "";

        return `<span class="forma-pagamento-hoje">${escaparHTML(forma + parcelas)}</span>`;
    }).join("");

    return `
        <td class="resumo-financeiro-hoje">${resumos}</td>
        <td class="pagamento-financeiro-hoje">${pagamentos}</td>
    `;
}

function filtroCorrespondeStatus(filtro, status) {
    if (
        !filtro ||
        filtro === "todos" ||
        filtro === "todas"
    ) {
        return true;
    }

    if (filtro === "novo" || filtro === "novos") {
        return status === "novo";
    }

    if (
        filtro === "atendimento" ||
        filtro === "em atendimento"
    ) {
        return [
            "em atendimento",
            "atendimento",
            "em contato",
            "contato iniciado"
        ].includes(status);
    }

    if (
        filtro === "agendado" ||
        filtro === "agendados"
    ) {
        return [
            "agendado",
            "agendada",
            "consulta agendada"
        ].includes(status);
    }

    if (
        filtro === "convertido" ||
        filtro === "convertidos"
    ) {
        return [
            "convertido",
            "convertida",
            "fechado",
            "fechada",
            "cliente",
            "venda"
        ].includes(status);
    }

    if (
        filtro === "manutencao" ||
        filtro === "manutenção"
    ) {
        return [
            "manutencao",
            "manutenção",
            "cliente em manutencao",
            "cliente em manutenção",
            "renovacao",
            "renovação"
        ].includes(status);
    }

    return status.includes(filtro);
}

// ======================================================
// DRAWER
// ======================================================

function configurarDrawer() {
    const botoesFechar = document.querySelectorAll(
        "#fecharDrawer, .fechar-drawer, [data-close-drawer]"
    );

    botoesFechar.forEach((botao) => {
        botao.addEventListener("click", fecharDrawer);
    });

    const overlay = obterElemento("drawerOverlay");

    if (overlay) {
        overlay.addEventListener("click", fecharDrawer);
    }

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
            fecharDrawer();
        }
    });
}

function abrirLead(id) {
    const lead = todosOsLeads.find((item) => {
        return String(obterIdLead(item)) === String(id);
    });

    if (!lead) {
        console.error("Paciente não encontrado:", id);
        mostrarMensagem(
            "Não foi possível localizar este paciente.",
            "erro"
        );

        return;
    }

    leadSelecionado = lead;

    preencherDrawer(lead);

    const drawer = obterElemento("patientDrawer");
    const overlay = obterElemento("drawerOverlay");

    if (drawer) {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
    }

    if (overlay) {
        overlay.classList.add("open");
    }

    document.body.classList.add("drawer-open");
}

function fecharDrawer() {
    const drawer = obterElemento("patientDrawer");
    const overlay = obterElemento("drawerOverlay");

    if (drawer) {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
    }

    if (overlay) {
        overlay.classList.remove("open");
    }

    document.body.classList.remove("drawer-open");

    leadSelecionado = null;
}

// Disponibiliza para scripts inline do HTML, caso necessário.
window.abrirLead = abrirLead;
window.fecharDrawer = fecharDrawer;

// ======================================================
// PREENCHIMENTO DO DRAWER
// ======================================================

function preencherDrawer(lead) {
    if (!lead) {
        console.error(
            "Nenhum paciente foi informado para preencher o drawer."
        );

        return;
    }

    const visitanteId = obterPrimeiroValor(
        lead.visitante_id,
        lead.uuid,
        "-"
    );

    const nome = obterPrimeiroValor(
        lead.nome,
        lead.name,
        lead.nome_completo,
        "Paciente sem nome"
    );

    const telefone = obterPrimeiroValor(
        lead.telefone,
        lead.phone,
        lead.whatsapp,
        lead.celular,
        "-"
    );

    const status = obterPrimeiroValor(
        lead.status,
        "novo"
    );

    const dataCadastro = obterPrimeiroValor(
        lead.criado_em,
        lead.primeira_visita,
        "-"
    );

    const origem = formatarOrigem(
        obterPrimeiroValor(
            lead.ultima_utm_source,
            lead.primeira_utm_source,
            "Direto"
        )
    );

    const campanha = obterPrimeiroValor(
        lead.ultima_utm_campaign,
        lead.primeira_utm_campaign,
        "-"
    );

    const meio = obterPrimeiroValor(
        lead.ultima_utm_medium,
        lead.primeira_utm_medium,
        "-"
    );

    // ==================================================
    // CABEÇALHO DO DRAWER
    // ==================================================

    definirTexto(
        "drawerNome",
        nome
    );

    definirTexto(
    "drawerCodigoLead",
    ""
);

    definirTexto(
        "drawerTelefone",
        formatarTelefone(telefone)
    );

    definirTexto(
        "drawerCadastro",
        formatarData(dataCadastro)
    );

    definirTexto(
        "drawerOrigem",
        origem
    );

    definirTexto(
        "drawerStatus",
        formatarStatus(status)
    );

    // ==================================================
    // CAMPANHA E MARKETING
    // ==================================================

    definirTexto(
        "drawerCampanha",
        campanha
    );

    definirTexto(
        "drawerConjunto",
        obterPrimeiroValor(
            lead.adset_name,
            lead.nome_conjunto,
            lead.conjunto,
            "-"
        )
    );

    definirTexto(
        "drawerAnuncio",
        obterPrimeiroValor(
            lead.ad_name,
            lead.nome_anuncio,
            lead.anuncio,
            lead.primeira_utm_content,
            "-"
        )
    );

    definirTexto(
        "drawerOrigemMarketing",
        meio
    );

    // ==================================================
    // CAMPOS EDITÁVEIS
    // ==================================================

    definirValor(
        "nomePacienteEditar",
        nome
    );

    definirValor(
        "telefonePacienteEditar",
        telefone === "-" ? "" : telefone
    );

    definirValor(
        "statusFinanceiro",
        normalizarValorSelect(status)
    );

    /*
     * Valor e observações pertencem à tabela conversoes.
     * Enquanto a rota específica de conversões não estiver
     * conectada, os campos permanecem vazios.
     */

    definirValor(
        "valorConversao",
        obterPrimeiroValor(
            lead.valor_conversao,
            lead.valor,
            ""
        )
    );

    definirValor(
        "observacoes",
        obterPrimeiroValor(
            lead.observacoes,
            lead.observacao,
            ""
        )
    );

// ==================================================
// DADOS DE RASTREAMENTO
// ==================================================



// ==================================================
// RESUMO DE ORIGEM
// ==================================================

definirTexto(
    "utm_source",
    obterPrimeiroValor(
        lead.ultima_utm_source,
        lead.primeira_utm_source,
        "Direto"
    )
);

definirTexto(
    "utm_campaign",
    obterPrimeiroValor(
        lead.ultima_utm_campaign,
        lead.primeira_utm_campaign,
        "-"
    )
);

definirTexto(
    "device",
    obterPrimeiroValor(
        lead.ultimo_dispositivo,
        identificarDispositivo(
            lead.primeiro_user_agent
        ),
        "-"
    )
);

definirTexto(
    "landing_page",
    obterPrimeiroValor(
        lead.landing_page,
        lead.pagina,
        "-"
    )
);


}

// ======================================================
// SALVAMENTO
// ======================================================

function configurarSalvamento() {
    const botaoSalvar =
        obterElemento("btnSalvarDrawer");

    if (!botaoSalvar) {
        console.warn(
            "O botão #btnSalvarDrawer não foi encontrado."
        );

        return;
    }

    botaoSalvar.addEventListener(
        "click",
        salvarLead
    );
}

// ======================================================
// INICIALIZAÇÃO
// ======================================================

function mostrarCarregamento() {
    const tbody = obterCorpoTabela();

    if (!tbody) {
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="estado-tabela">
                Carregando pacientes...
            </td>
        </tr>
    `;
}

function mostrarErroNaTabela(mensagem) {
    const tbody = obterCorpoTabela();

    if (!tbody) {
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td
                colspan="6"
                class="estado-tabela estado-erro"
            >
                Não foi possível carregar os pacientes.

                <br>

                <small>
                    ${escaparHTML(mensagem)}
                </small>

                <br>

                <button
                    type="button"
                    class="botao-tentar-novamente"
                    id="tentarNovamente"
                >
                    Tentar novamente
                </button>
            </td>
        </tr>
    `;

    const botao = obterElemento("tentarNovamente");

    if (botao) {
        botao.addEventListener(
            "click",
            carregarLeads
        );
    }
}

// ======================================================
// MENSAGENS
// ======================================================

function mostrarMensagem(texto, tipo = "sucesso") {
    const mensagemAnterior =
        document.querySelector(".atlas-mensagem");

    if (mensagemAnterior) {
        mensagemAnterior.remove();
    }

    const mensagem =
        document.createElement("div");

    mensagem.className =
        `atlas-mensagem atlas-mensagem-${tipo}`;

    mensagem.textContent = texto;

    document.body.appendChild(mensagem);

    window.setTimeout(() => {
        mensagem.classList.add("visivel");
    }, 10);

    window.setTimeout(() => {
        mensagem.classList.remove("visivel");

        window.setTimeout(() => {
            mensagem.remove();
        }, 300);
    }, 3000);
}

function definirBotaoCarregando(botao, carregando) {
    if (!botao) {
        return;
    }

    if (carregando) {
        if (!botao.dataset.textoOriginal) {
            botao.dataset.textoOriginal =
                botao.innerHTML;
        }

        botao.disabled = true;
        botao.innerHTML = "Salvando...";
        return;
    }

    botao.disabled = false;

    if (botao.dataset.textoOriginal) {
        botao.innerHTML =
            botao.dataset.textoOriginal;
    }
}

// ======================================================
// MANIPULAÇÃO DE ELEMENTOS
// ======================================================

function definirTexto(id, valor) {
    const elemento = obterElemento(id);

    if (!elemento) {
        return;
    }

    const texto =
        valor === null ||
        valor === undefined ||
        String(valor).trim() === ""
            ? "-"
            : String(valor);

    elemento.textContent = texto;
    elemento.title = texto;
}

function definirValor(id, valor) {
    const elemento = obterElemento(id);

    if (!elemento) {
        return;
    }

    const valorFinal =
        valor === null ||
        valor === undefined
            ? ""
            : String(valor);

    if (elemento.tagName === "SELECT") {
        definirValorSelect(elemento, valorFinal);
        return;
    }

    elemento.value = valorFinal;
}

function definirValorSelect(select, valor) {
    const valorNormalizado =
        normalizarStatus(valor);

    const opcao = Array.from(select.options).find(
        (item) => {
            const valorOpcao =
                normalizarStatus(item.value);

            const textoOpcao =
                normalizarStatus(item.textContent);

            return (
                valorOpcao === valorNormalizado ||
                textoOpcao === valorNormalizado
            );
        }
    );

    if (opcao) {
        select.value = opcao.value;
        return;
    }

    select.value = valor;
}

function obterValorElemento(id) {
    const elemento = obterElemento(id);

    if (!elemento) {
        return "";
    }

    return String(elemento.value ?? "").trim();
}

// ======================================================
// FUNÇÕES DE DADOS
// ======================================================

function obterIdLead(lead) {
    return obterPrimeiroValor(
        lead.visitante_id,
        lead.uuid
    );
}

function obterStatusLead(lead) {
    return obterPrimeiroValor(
        lead.status,
        "novo"
    );
}

function obterPrimeiroValor(...valores) {
    for (const valor of valores) {
        if (
            valor !== undefined &&
            valor !== null &&
            String(valor).trim() !== ""
        ) {
            return valor;
        }
    }

    return "";
}

// ======================================================
// FORMATAÇÃO
// ======================================================

function normalizarTexto(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function normalizarStatus(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

function normalizarValorSelect(status) {
    const valor = normalizarStatus(status);

    const equivalencias = {
        novo: "novo",
        atendimento: "em_atendimento",
        "em atendimento": "em_atendimento",
        "em contato": "em_atendimento",
        "contato iniciado": "em_atendimento",
        agendado: "agendado",
        agendada: "agendado",
        "consulta agendada": "agendado",
        convertido: "convertido",
        convertida: "convertido",
        fechado: "convertido",
        fechada: "convertido",
        cliente: "convertido",
        venda: "convertido",
        manutencao: "manutencao",
        "manutenção": "manutencao",
        "cliente em manutencao": "manutencao",
        "cliente em manutenção": "manutencao",
        renovacao: "manutencao",
        "renovação": "manutencao"
    };

    return equivalencias[valor] || valor;
}

function formatarOrigem(origem) {
    const valor = normalizarTexto(origem);

    const nomes = {
        indicacao: "Indicação",
        clinica: "Conheceu a clínica",
        instagram_organico: "Instagram (sem anúncio)",
        google_organico: "Google (sem anúncio)",
        outros: "Outro",
        direto: "Direto"
    };

    return nomes[valor] || String(origem || "Direto");
}

function formatarStatus(status) {
    const valor = normalizarStatus(status);

    const nomes = {
        novo: "Novo",
        atendimento: "Em atendimento",
        "em atendimento": "Em atendimento",
        "em contato": "Em atendimento",
        "contato iniciado": "Em atendimento",
        agendado: "Agendado",
        agendada: "Agendado",
        "consulta agendada": "Agendado",
        convertido: "Atendido",
        convertida: "Atendido",
        fechado: "Atendido",
        fechada: "Atendido",
        cliente: "Atendido",
        venda: "Atendido",
        manutencao: "Retorno",
        "manutenção": "Retorno",
        "cliente em manutencao": "Retorno",
        "cliente em manutenção": "Retorno",
        renovacao: "Retorno",
        "renovação": "Retorno"
    };

    if (nomes[valor]) {
        return nomes[valor];
    }

    if (!valor) {
        return "Novo";
    }

    return valor.replace(/\b\w/g, (letra) => {
        return letra.toUpperCase();
    });
}

function obterClasseStatus(status) {
    const valor = normalizarStatus(status);

    if (
        [
            "convertido",
            "convertida",
            "fechado",
            "fechada",
            "cliente",
            "venda"
        ].includes(valor)
    ) {
        return "status-convertido";
    }

    if (
        [
            "agendado",
            "agendada",
            "consulta agendada"
        ].includes(valor)
    ) {
        return "status-agendado";
    }

    if (
        [
            "em atendimento",
            "atendimento",
            "em contato",
            "contato iniciado"
        ].includes(valor)
    ) {
        return "status-atendimento";
    }

    if (
        [
            "manutencao",
            "manutenção",
            "cliente em manutencao",
            "cliente em manutenção",
            "renovacao",
            "renovação"
        ].includes(valor)
    ) {
        return "status-manutencao";
    }

    return "status-novo";
}

function obterIniciais(nome) {
    const partes = String(nome ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (partes.length === 0) {
        return "?";
    }

    if (partes.length === 1) {
        return partes[0]
            .slice(0, 2)
            .toUpperCase();
    }

    return (
        partes[0].charAt(0) +
        partes[partes.length - 1].charAt(0)
    ).toUpperCase();
}

function formatarTelefone(valor) {
    const telefoneOriginal =
        String(valor ?? "").trim();

    if (
        !telefoneOriginal ||
        telefoneOriginal === "-"
    ) {
        return "-";
    }

    let numeros =
        telefoneOriginal.replace(/\D/g, "");

    if (
        (numeros.length === 12 ||
            numeros.length === 13) &&
        numeros.startsWith("55")
    ) {
        numeros = numeros.slice(2);
    }

    if (numeros.length === 11) {
        return numeros.replace(
            /^(\d{2})(\d{5})(\d{4})$/,
            "($1) $2-$3"
        );
    }

    if (numeros.length === 10) {
        return numeros.replace(
            /^(\d{2})(\d{4})(\d{4})$/,
            "($1) $2-$3"
        );
    }

    return telefoneOriginal;
}

function formatarMoeda(valor) {
    const numero = Number(valor ?? 0);

    return numero.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function dataEstaNoIntervalo(
    data,
    inicio,
    fim
) {
    if (
        !(data instanceof Date) ||
        Number.isNaN(data.getTime())
    ) {
        return false;
    }

    return (
        data.getTime() >= inicio.getTime() &&
        data.getTime() <= fim.getTime()
    );
}

function converterData(valor) {
    if (!valor) {
        return null;
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
        return null;
    }

    return data;
}

function formatarData(valor) {
    const data = converterData(valor);

    if (!data) {
        return valor ? String(valor) : "-";
    }

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(data);
}

function obterInicioDoDia(data) {
    return new Date(
        data.getFullYear(),
        data.getMonth(),
        data.getDate()
    );
}

function identificarDispositivo(userAgent) {
    if (!userAgent) {
        return "";
    }

    const agente =
        String(userAgent).toLowerCase();

    if (
        agente.includes("iphone") ||
        agente.includes("ipad") ||
        agente.includes("ipod")
    ) {
        return "iOS";
    }

    if (agente.includes("android")) {
        return "Android";
    }

    if (agente.includes("windows")) {
        return "Windows";
    }

    if (
        agente.includes("macintosh") ||
        agente.includes("mac os")
    ) {
        return "Mac";
    }

    if (agente.includes("linux")) {
        return "Linux";
    }

    return "Outro dispositivo";
}

function formatarValorParaInput(valor) {
    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {
        return "";
    }

    if (typeof valor === "number") {
        return valor.toFixed(2);
    }

    return String(valor)
        .replace(/[^\d,.-]/g, "")
        .replace(",", ".");
}

function converterValorNumerico(valor) {
    if (
        valor === null ||
        valor === undefined ||
        String(valor).trim() === ""
    ) {
        return null;
    }

    let texto = String(valor)
        .trim()
        .replace(/[^\d,.-]/g, "");

    if (
        texto.includes(",") &&
        texto.includes(".")
    ) {
        texto = texto
            .replace(/\./g, "")
            .replace(",", ".");
    } else {
        texto = texto.replace(",", ".");
    }

    const numero = Number(texto);

    return Number.isFinite(numero)
        ? numero
        : null;
}

// ======================================================
// SEGURANÇA DE TEXTO
// ======================================================

function escaparHTML(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escaparAtributo(valor) {
    return escaparHTML(valor);
}

// ======================================================
// TRATAMENTO DE ERROS DA API
// ======================================================

async function lerMensagemDeErro(resposta) {
    try {
        const tipoConteudo =
            resposta.headers.get("content-type") || "";

        if (tipoConteudo.includes("application/json")) {
            const corpo = await resposta.json();

            return obterPrimeiroValor(
                corpo.message,
                corpo.mensagem,
                corpo.error,
                corpo.erro,
                JSON.stringify(corpo)
            );
        }

        return await resposta.text();
    } catch {
        return "";
    }
}

document.addEventListener(
    "visibilitychange",
    () => {
        if (
            document.visibilityState ===
            "visible"
        ) {
            carregarLeadsEmSegundoPlano();
        }
    }
);

async function atualizarResumoReceita() {
    try {
        const resposta = await fetch(
            `/api/conversoes/resumo?t=${Date.now()}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                },
                cache: "no-store"
            }
        );

        if (!resposta.ok) {
            throw new Error(
                `Erro HTTP ${resposta.status}`
            );
        }

        const retorno =
            await resposta.json();

        definirTexto(
            "receitaHoje",
            formatarMoeda(
                retorno.receitaHoje || 0
            )
        );

        definirTexto(
            "receitaMes",
            formatarMoeda(
                retorno.receitaMes || 0
            )
        );
    } catch (erro) {
        console.error(
            "Erro atualizando receita:",
            erro
        );

        definirTexto(
            "receitaHoje",
            formatarMoeda(0)
        );

        definirTexto(
            "receitaMes",
            formatarMoeda(0)
        );
    }
}

function agendarViradaDoDia() {
    const agora = new Date();

    const proximaMeiaNoite = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate() + 1,
        0,
        0,
        1,
        0
    );

    const tempoAteVirada =
        proximaMeiaNoite.getTime() -
        agora.getTime();

    window.setTimeout(() => {
        atualizarIndicadores(todosOsLeads);
        carregarLeadsEmSegundoPlano();

        agendarViradaDoDia();
    }, tempoAteVirada);
}

async function salvarAgendamento(
    visitanteId,
    dataAvaliacao
) {
    const resposta = await fetch(
        "/api/agendamentos",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                visitante_id: visitanteId,
                data_avaliacao:
                    new Date(
                        dataAvaliacao
                    ).toISOString(),
                observacao:
                    obterValorElemento(
                        "observacoes"
                    )
            })
        }
    );

    if (!resposta.ok) {
        const mensagem =
            await lerMensagemDeErro(resposta);

        throw new Error(
            mensagem ||
            "Paciente atualizado, mas o agendamento não foi salvo."
        );
    }

    return resposta.json();
}

async function atualizarAvaliacoesHoje() {
    const agora = new Date();

    const inicioDia = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        0,
        0,
        0,
        0
    );

    const fimDia = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        23,
        59,
        59,
        999
    );

    try {
        const parametros =
            new URLSearchParams({
                inicio:
                    inicioDia.toISOString(),
                fim:
                    fimDia.toISOString()
            });

        const resposta = await fetch(
            `/api/agendamentos/hoje?${parametros}`,
            {
                headers: {
                    Accept:
                        "application/json"
                },
                cache: "no-store"
            }
        );

        if (!resposta.ok) {
            throw new Error(
                `Erro HTTP ${resposta.status}`
            );
        }

        const retorno =
            await resposta.json();

        definirTexto(
            "avaliacoesHoje",
            retorno.total || 0
        );
    } catch (erro) {
        console.error(
            "Erro atualizando avaliações de hoje:",
            erro
        );

        definirTexto(
            "avaliacoesHoje",
            0
        );
    }
}

// Brazilian currency mask: digits are entered as cents.
function formatarValorDigitado(valor) {
    const numeros = String(valor || "").replace(/\D/g, "");
    if (!numeros) return "";
    return (Number(numeros) / 100).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}
function lerValorMonetario(valor) {
    const texto = String(valor || "").trim();
    if (!texto) return NaN;
    return Number(texto.replace(/\./g, "").replace(",", "."));
}
document.addEventListener("DOMContentLoaded", () => {
    const campo = document.getElementById("financeiroValorLivre");
    campo?.addEventListener("input", () => {
        campo.value = formatarValorDigitado(campo.value);
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const hoje = window.KahennaAniversarios.hojeBrasil();
    for (const id of ["novoPacienteNascimento", "editarNascimentoIdentificacao"]) {
        document.getElementById(id)?.setAttribute("max", hoje);
    }
});
