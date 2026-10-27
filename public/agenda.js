"use strict";

const HORA_INICIAL = 7;
const HORA_FINAL = 20;
const INTERVALO_MINUTOS = 30;

let inicioSemana = obterInicioSemana(new Date());
let agendamentos = [];
let pacientes = [];
let agendamentoSelecionado = null;

document.addEventListener("DOMContentLoaded", async () => {
    configurarEventos();
    await carregarPacientes();
    await carregarAgenda();
    if (new URLSearchParams(location.search).get("novo") === "1") abrirModal();
});

function configurarEventos() {
    document.getElementById("semanaAnterior").addEventListener("click", async () => {
        inicioSemana.setDate(inicioSemana.getDate() - 7);
        await carregarAgenda();
    });
    document.getElementById("proximaSemana").addEventListener("click", async () => {
        inicioSemana.setDate(inicioSemana.getDate() + 7);
        await carregarAgenda();
    });
    document.getElementById("irParaHoje").addEventListener("click", async () => {
        inicioSemana = obterInicioSemana(new Date());
        await carregarAgenda();
    });
    document.getElementById("atualizarAgenda").addEventListener("click", carregarAgenda);
    document.getElementById("novoAgendamento").addEventListener("click", () => abrirModal());
    document.getElementById("fecharModalAgendamento").addEventListener("click", fecharModal);
    document.getElementById("fecharSemSalvar").addEventListener("click", fecharModal);
    document.getElementById("formAgendamento").addEventListener("submit", salvarAgendamento);
    document.getElementById("cancelarAgendamento").addEventListener("click", cancelarAgendamento);
    const campoPaciente = document.getElementById("nomePacienteAgendamento");
    campoPaciente.addEventListener("input", pesquisarPaciente);
    campoPaciente.addEventListener("focus", pesquisarPaciente);
    document.addEventListener("click", (evento) => {
        if (!evento.target.closest("#buscaPacienteAgenda")) ocultarSugestoesPacientes();
    });
    document.getElementById("modalAgendamento").addEventListener("click", (evento) => {
        if (evento.target.id === "modalAgendamento") fecharModal();
    });
}

async function carregarPacientes() {
    try {
        const resposta = await fetch(`/api/leads?t=${Date.now()}`, { cache: "no-store" });
        if (!resposta.ok) throw new Error(await lerErro(resposta));
        const retorno = await resposta.json();
        pacientes = Array.isArray(retorno) ? retorno : retorno.data || [];
        pacientes.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    } catch (erro) {
        mostrarMensagem(`Não foi possível carregar os pacientes: ${erro.message}`);
    }
}

function pesquisarPaciente() {
    const campo = document.getElementById("nomePacienteAgendamento");
    if (campo.readOnly) return;

    document.getElementById("pacienteAgendamento").value = "";
    const termo = normalizarBusca(campo.value);
    if (termo.length < 2) return renderizarSugestoesPacientes([], termo);

    const telefoneBuscado = String(campo.value || "").replace(/\D/g, "");
    const encontrados = pacientes.filter((paciente) => {
        const nome = normalizarBusca(paciente.nome);
        const telefone = String(paciente.telefone || "").replace(/\D/g, "");
        return nome.includes(termo) || (telefoneBuscado && telefone.includes(telefoneBuscado));
    }).slice(0, 8);

    renderizarSugestoesPacientes(encontrados, termo);
}

function renderizarSugestoesPacientes(lista, termo) {
    const sugestoes = document.getElementById("sugestoesPacientesAgenda");
    if (termo.length < 2) {
        sugestoes.hidden = true;
        sugestoes.innerHTML = "";
        return;
    }

    sugestoes.innerHTML = lista.length ? lista.map((paciente) => `
        <button type="button" class="patient-suggestion" role="option"
            data-id="${escaparAtributo(paciente.visitante_id)}">
            <strong>${escaparHTML(paciente.nome || "Sem nome")}</strong>
            <span>${escaparHTML(formatarTelefone(paciente.telefone))}</span>
        </button>`).join("") : '<div class="patient-empty">Nenhum paciente encontrado.</div>';
    sugestoes.hidden = false;
    sugestoes.querySelectorAll(".patient-suggestion").forEach((botao) => {
        botao.addEventListener("click", () => selecionarPaciente(botao.dataset.id));
    });
}

function selecionarPaciente(visitanteId) {
    const paciente = pacientes.find((item) => String(item.visitante_id) === String(visitanteId));
    if (!paciente) return;
    document.getElementById("pacienteAgendamento").value = paciente.visitante_id;
    document.getElementById("nomePacienteAgendamento").value = paciente.nome || "Sem nome";
    ocultarSugestoesPacientes();
}

function ocultarSugestoesPacientes() {
    document.getElementById("sugestoesPacientesAgenda").hidden = true;
}

async function carregarAgenda() {
    const botao = document.getElementById("atualizarAgenda");
    botao.disabled = true;
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(fimSemana.getDate() + 7);

    try {
        const parametros = new URLSearchParams({
            inicio: inicioSemana.toISOString(),
            fim: fimSemana.toISOString()
        });
        const resposta = await fetch(`/api/agendamentos?${parametros}&t=${Date.now()}`, { cache: "no-store" });
        if (!resposta.ok) throw new Error(await lerErro(resposta));
        const retorno = await resposta.json();
        agendamentos = retorno.data || [];
        renderizarCalendario();
        document.getElementById("resumoAgenda").textContent = `${agendamentos.length} ${agendamentos.length === 1 ? "agendamento" : "agendamentos"}`;
        ocultarMensagem();
    } catch (erro) {
        agendamentos = [];
        renderizarCalendario();
        mostrarMensagem(`Não foi possível carregar a agenda: ${erro.message}`);
    } finally {
        botao.disabled = false;
    }
}

function renderizarCalendario() {
    const calendario = document.getElementById("calendarioSemanal");
    const dias = Array.from({ length: 7 }, (_, indice) => {
        const data = new Date(inicioSemana);
        data.setDate(data.getDate() + indice);
        return data;
    });
    const hoje = chaveData(new Date());

    document.getElementById("tituloPeriodo").textContent = formatarPeriodo(dias[0], dias[6]);
    calendario.innerHTML = '<div class="calendar-corner"></div>' + dias.map((dia) => `
        <div class="day-header ${chaveData(dia) === hoje ? "today" : ""}">
            <span>${formatarDiaSemana(dia)}</span><strong>${dia.getDate()}</strong>
        </div>`).join("");

    for (let minutos = HORA_INICIAL * 60; minutos < HORA_FINAL * 60; minutos += INTERVALO_MINUTOS) {
        const hora = formatarMinutos(minutos);
        calendario.insertAdjacentHTML("beforeend", `<div class="time-label">${hora}</div>`);

        dias.forEach((dia) => {
            const dataHora = combinarDataHora(dia, minutos);
            const itens = agendamentos.filter((item) => {
                const data = new Date(item.data_avaliacao);
                const minutosAgendamento =
                    data.getHours() * 60 + data.getMinutes();

                return chaveData(data) === chaveData(dia) &&
                    Math.floor(
                        minutosAgendamento / INTERVALO_MINUTOS
                    ) * INTERVALO_MINUTOS === minutos;
            });
            const cartoes = itens.map(criarCartaoAgendamento).join("");
            calendario.insertAdjacentHTML("beforeend", `
                <div class="calendar-slot ${dataHora < new Date() ? "past" : ""}" data-data-hora="${dataHora.toISOString()}">
                    ${cartoes}
                </div>`);
        });
    }

    calendario.querySelectorAll(".calendar-slot").forEach((slot) => slot.addEventListener("click", (evento) => {
        if (evento.target.closest(".appointment-card")) return;
        abrirModal(new Date(slot.dataset.dataHora));
    }));
    calendario.querySelectorAll(".appointment-card").forEach((cartao) => cartao.addEventListener("click", () => {
        const agendamento = agendamentos.find((item) => String(item.id) === cartao.dataset.id);
        if (agendamento) abrirModal(new Date(agendamento.data_avaliacao), agendamento);
    }));
}

function criarCartaoAgendamento(item) {
    const paciente = item.paciente || {};
    const horario = valorHoraInput(
        new Date(item.data_avaliacao)
    );
    return `<button class="appointment-card" type="button" data-id="${escaparAtributo(item.id)}">
        <strong>${escaparHTML(paciente.nome || "Paciente")}</strong>
        <span>${escaparHTML(horario)} · ${escaparHTML(formatarTelefone(paciente.telefone))}</span>
        <small>${escaparHTML(item.observacao || "Avaliação agendada")}</small>
    </button>`;
}

function abrirModal(data = proximoHorarioDisponivel(), agendamento = null) {
    agendamentoSelecionado = agendamento;
    const pacienteAtual = agendamento
        ? pacientes.find((item) => String(item.visitante_id) === String(agendamento.visitante_id)) || agendamento.paciente
        : null;
    document.getElementById("tituloModalAgendamento").textContent = agendamento ? "Editar agendamento" : "Novo agendamento";
    document.getElementById("pacienteAgendamento").value = agendamento?.visitante_id || "";
    document.getElementById("nomePacienteAgendamento").value = pacienteAtual?.nome || "";
    document.getElementById("nomePacienteAgendamento").readOnly = Boolean(agendamento);
    ocultarSugestoesPacientes();
    document.getElementById("dataAgendamento").value = valorDataInput(data);
    document.getElementById("horaAgendamento").value = valorHoraInput(data);
    document.getElementById("observacaoAgendamento").value = agendamento?.observacao || "";
    document.getElementById("cancelarAgendamento").hidden = !agendamento;
    document.getElementById("feedbackAgendamento").hidden = true;
    document.getElementById("modalAgendamento").hidden = false;
    document.body.style.overflow = "hidden";
}

function fecharModal() {
    document.getElementById("modalAgendamento").hidden = true;
    document.body.style.overflow = "";
    agendamentoSelecionado = null;
}

async function salvarAgendamento(evento) {
    evento.preventDefault();
    const visitanteId = document.getElementById("pacienteAgendamento").value;
    const data = document.getElementById("dataAgendamento").value;
    const hora = document.getElementById("horaAgendamento").value;
    const observacao = document.getElementById("observacaoAgendamento").value.trim();
    const dataAvaliacao = new Date(`${data}T${hora}`);
    const botao = document.getElementById("salvarAgendamento");

    if (!visitanteId || Number.isNaN(dataAvaliacao.getTime())) {
        return mostrarFeedback("Selecione o paciente, a data e o horário.");
    }

    botao.disabled = true;
    try {
        const resposta = await fetch("/api/agendamentos", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                visitante_id: visitanteId,
                agendamento_id: agendamentoSelecionado?.id,
                data_avaliacao: dataAvaliacao.toISOString(),
                observacao: observacao || null
            })
        });
        if (!resposta.ok) throw new Error(await lerErro(resposta));
        fecharModal();
        inicioSemana = obterInicioSemana(dataAvaliacao);
        await carregarAgenda();
    } catch (erro) {
        mostrarFeedback(erro.message || "Não foi possível salvar o horário.");
    } finally {
        botao.disabled = false;
    }
}

async function cancelarAgendamento() {
    if (!agendamentoSelecionado) return;
    if (!window.confirm("Deseja realmente cancelar este horário? O registro continuará salvo no histórico.")) return;
    const botao = document.getElementById("cancelarAgendamento");
    botao.disabled = true;
    try {
        const resposta = await fetch(`/api/agendamentos/${encodeURIComponent(agendamentoSelecionado.id)}/cancelar`, { method: "PATCH" });
        if (!resposta.ok) throw new Error(await lerErro(resposta));
        fecharModal();
        await carregarAgenda();
    } catch (erro) {
        mostrarFeedback(erro.message || "Não foi possível cancelar o horário.");
    } finally {
        botao.disabled = false;
    }
}

function obterInicioSemana(data) { const inicio = new Date(data); const dia = inicio.getDay(); inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1)); inicio.setHours(0, 0, 0, 0); return inicio; }
function combinarDataHora(data, minutos) { const valor = new Date(data); valor.setHours(Math.floor(minutos / 60), minutos % 60, 0, 0); return valor; }
function chaveData(data) { return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`; }
function valorDataInput(data) { return chaveData(data); }
function valorHoraInput(data) { return formatarMinutos(data.getHours() * 60 + data.getMinutes()); }
function proximoHorarioDisponivel() { const data = new Date(); const minutos = Math.ceil((data.getHours() * 60 + data.getMinutes()) / INTERVALO_MINUTOS) * INTERVALO_MINUTOS; data.setHours(Math.floor(minutos / 60) % 24, minutos % 60, 0, 0); if (minutos >= 24 * 60) data.setDate(data.getDate() + 1); return data; }
function formatarMinutos(minutos) { return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`; }
function formatarDiaSemana(data) { return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(data).replace(".", ""); }
function normalizarBusca(valor) { return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function formatarPeriodo(inicio, fim) { const formato = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }); return `${formato.format(inicio)} — ${formato.format(fim)} de ${fim.getFullYear()}`; }
function formatarTelefone(valor) { const n = String(valor || "").replace(/\D/g, ""); if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; return valor || "Sem telefone"; }
function mostrarMensagem(texto) { const el = document.getElementById("mensagemAgenda"); el.textContent = texto; el.hidden = false; }
function ocultarMensagem() { document.getElementById("mensagemAgenda").hidden = true; }
function mostrarFeedback(texto) { const el = document.getElementById("feedbackAgendamento"); el.textContent = texto; el.hidden = false; }
async function lerErro(resposta) { try { const dados = await resposta.json(); return dados.mensagem || dados.erro || `Erro HTTP ${resposta.status}`; } catch { return `Erro HTTP ${resposta.status}`; } }
function escaparHTML(valor) { const el = document.createElement("div"); el.textContent = String(valor ?? ""); return el.innerHTML; }
function escaparAtributo(valor) { return escaparHTML(valor).replace(/"/g, "&quot;"); }
