"use strict";

const HORA_INICIAL = 7;
const HORA_FINAL = 20;
const INTERVALO_MINUTOS = 60;
const turnosClinica = new Map();
for (const [periodo, inicio, fim, novembro, dezembro] of [
    ["Matutino", 8, 12, "06 09 12 18 21 24 27 30", "03 09 12 15 18 21 24 30"],
    ["Vespertino", 13, 18, "04 07 10 13 16 19 25 28", "01 04 07 10 16 19 22 25 28 31"],
    ["Noturno", 18, 24, "05 11 14 17 20 23 26", "02 05 08 11 14 17 23 26 29"]
]) {
    for (const [mes, datas] of [["11", novembro], ["12", dezembro]]) {
        for (const dia of datas.split(" ")) {
            turnosClinica.set(`2026-${mes}-${dia}`, { periodo, inicio, fim });
        }
    }
}

let inicioSemana = obterInicioSemana(new Date());
let agendamentos = [];
let pacientes = [];
let agendamentoSelecionado = null;
let consultaSemana = 0;

document.addEventListener("DOMContentLoaded", async () => {
    configurarFormulario();
    const atalho = document.querySelector("[data-crm-agendar]");
    if (atalho) {
        atalho.addEventListener("click", async (evento) => {
            if (evento.defaultPrevented || evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.altKey || evento.shiftKey) return;
            evento.preventDefault();
            abrirModal();
            await carregarPacientes();
            if (!document.getElementById("modalAgendamento").hidden && document.getElementById("nomePacienteAgendamento").value) pesquisarPaciente();
        });
        return;
    }
    configurarEventos();
    await Promise.all([carregarPacientes(), carregarAgenda()]);
    const parametros = new URLSearchParams(location.search);
    if (parametros.get("novo") === "1") {
        abrirModal(undefined, null, parametros.get("paciente"), parametros.get("retorno") === "1");
    }
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
}

function configurarFormulario() {
    const dataTexto = document.getElementById("dataAgendamentoTexto");
    const calendario = document.getElementById("dataAgendamento");
    dataTexto.addEventListener("input", () => {
        dataTexto.value = dataTexto.value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2}\/\d{2})(\d)/, "$1/$2");
        const partes = dataTexto.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const iso = partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : "";
        calendario.value = iso;
        const valida = iso && calendario.value === iso && valorDataInput(new Date(iso + "T12:00:00")) === iso;
        dataTexto.setCustomValidity(valida ? "" : "Informe uma data válida no formato dd/mm/aaaa.");
        mostrarTurnoRetorno(valida ? calendario.value : "");
    });
    calendario.addEventListener("change", () => {
        dataTexto.value = calendario.value ? calendario.value.split("-").reverse().join("/") : "";
        dataTexto.setCustomValidity("");
        mostrarTurnoRetorno(calendario.value);
    });
    document.getElementById("abrirCalendarioAgendamento").addEventListener("click", () => {
        if (calendario.showPicker) calendario.showPicker();
        else { calendario.focus(); calendario.click(); }
    });
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
        const mensagem = `Não foi possível carregar os pacientes: ${erro.message}`;
        if (document.getElementById("mensagemAgenda")) mostrarMensagem(mensagem);
        else mostrarFeedback(mensagem);
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
    const consulta = ++consultaSemana;
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
        if (consulta !== consultaSemana) return;
        agendamentos = retorno.data || [];
        renderizarCalendario();
        document.getElementById("resumoAgenda").textContent = `${agendamentos.length} ${agendamentos.length === 1 ? "agendamento" : "agendamentos"}`;
        ocultarMensagem();
    } catch (erro) {
        if (consulta !== consultaSemana) return;
        agendamentos = [];
        renderizarCalendario();
        mostrarMensagem(`Não foi possível carregar a agenda: ${erro.message}`);
    } finally {
        if (consulta === consultaSemana) botao.disabled = false;
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

    const turnos = dias.map(dia => turnosClinica.get(chaveData(dia)));
    const resumo = document.getElementById("turnosClinica");
    resumo.replaceChildren(...dias.flatMap((dia, indice) => {
        const turno = turnos[indice];
        if (!turno) return [];
        const item = document.createElement("li");
        const diaSemana = dia.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/^./, letra => letra.toUpperCase());
        const data = dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const diaLabel = document.createElement("strong");
        diaLabel.textContent = diaSemana;
        const periodoLabel = document.createElement("span");
        periodoLabel.textContent = `${data} · ${turno.periodo}`;
        item.append(diaLabel, periodoLabel);
        return [item];
    }));
    resumo.parentElement.hidden = !resumo.childElementCount;
    const temHorarioNoturno = agendamentos.some(item => new Date(item.data_avaliacao).getHours() >= HORA_FINAL);
    const fimGrade = temHorarioNoturno ? 24 : Math.max(HORA_FINAL, ...turnos.map(turno => turno?.fim || 0));
    document.getElementById("tituloPeriodo").textContent = formatarPeriodo(dias[0], dias[6]);
    calendario.innerHTML = '<div class="calendar-corner"></div>' + dias.map((dia) => `
        <div class="day-header ${chaveData(dia) === hoje ? "today" : ""}">
            <span>${formatarDiaSemana(dia)}</span><strong>${dia.getDate()}</strong>
        </div>`).join("");

    for (let minutos = HORA_INICIAL * 60; minutos < fimGrade * 60; minutos += INTERVALO_MINUTOS) {
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
    calendario.querySelectorAll(".appointment-card").forEach((cartao) => cartao.addEventListener("click", (evento) => {
        if(!evento.target.closest(".crm-agenda-edit"))return;
        const pagamento = evento.target.closest("[data-agenda-pagamento]");
        if (pagamento) {
            location.href = "/leads.html?" + new URLSearchParams({
                paciente: pagamento.dataset.agendaPagamento,
                acao: "financeiro"
            });
            return;
        }
        const agendamento = agendamentos.find((item) => String(item.id) === cartao.dataset.id);
        if (agendamento) abrirModal(new Date(agendamento.data_avaliacao), agendamento);
    }));
}

function criarCartaoAgendamento(item) {
    const paciente = item.paciente || {};
    const retorno = String(item.observacao || "").trim().toLowerCase() === "retorno";
    const horario = valorHoraInput(
        new Date(item.data_avaliacao)
    );
    return `<article class="appointment-card${retorno ? " appointment-return" : ""}${item.atendido_em ? " appointment-attended" : ""}" data-id="${escaparAtributo(item.id)}">
        <div class="crm-agenda-top"><button type="button" class="crm-agenda-patient" data-ver-paciente="${escaparAtributo(item.visitante_id)}" data-ficha-secao="atendimentos">${escaparHTML(paciente.nome || "Paciente")}</button><button type="button" class="crm-agenda-edit" data-agenda-pagamento="${escaparAtributo(item.visitante_id)}" aria-label="Receber pagamento" title="Receber pagamento"><i class="fa-solid fa-credit-card" aria-hidden="true"></i></button><button type="button" class="crm-agenda-edit" aria-label="Editar horário de ${escaparAtributo(paciente.nome||'paciente')}" title="Editar horário"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></div>
        <span>${escaparHTML(horario)} · ${escaparHTML(formatarTelefone(paciente.telefone))}</span>
        <small>${item.atendido_em ? "✓ Atendido" : escaparHTML(item.observacao || "Avaliação agendada")}</small>
    </article>`;
}

function abrirModal(data = proximoHorarioDisponivel(), agendamento = null, pacienteId = null, retorno = false) {
    agendamentoSelecionado = agendamento;
    const pacienteAtual = agendamento
        ? pacientes.find((item) => String(item.visitante_id) === String(agendamento.visitante_id)) || agendamento.paciente
        : null;
    document.getElementById("tituloModalAgendamento").textContent = agendamento ? "Editar agendamento" : retorno ? "Agendar retorno" : "Novo agendamento";
    document.getElementById("pacienteAgendamento").value = agendamento?.visitante_id || "";
    document.getElementById("nomePacienteAgendamento").value = pacienteAtual?.nome || "";
    document.getElementById("nomePacienteAgendamento").readOnly = Boolean(agendamento);
    ocultarSugestoesPacientes();
    document.getElementById("dataAgendamento").value = valorDataInput(data);
    document.getElementById("horaAgendamento").value = valorHoraInput(data);
    document.getElementById("observacaoAgendamento").value = agendamento?.observacao || "";
    const observacao = document.getElementById("observacaoAgendamento");
    observacao.closest("label").hidden = retorno;
    document.getElementById("modalAgendamento").classList.toggle("schedule-return", retorno);
    if (pacienteId) selecionarPaciente(pacienteId);
    if (retorno) {
        observacao.value = "Retorno";
        document.getElementById("dataAgendamento").value = "";
        document.getElementById("horaAgendamento").value = "";
    }
    const dataTexto = document.getElementById("dataAgendamentoTexto");
    dataTexto.value = document.getElementById("dataAgendamento").value.split("-").reverse().join("/");
    dataTexto.setCustomValidity("");
    mostrarTurnoRetorno(document.getElementById("dataAgendamento").value);
    document.getElementById("cancelarAgendamento").hidden = !agendamento;
    document.getElementById("feedbackAgendamento").hidden = true;
    document.getElementById("modalAgendamento").hidden = false;
    document.body.style.overflow = "hidden";
    if (retorno) {
        const campo = document.getElementById("pacienteAgendamento").value ? "dataAgendamentoTexto" : "nomePacienteAgendamento";
        document.getElementById(campo).focus();
    }
}

function fecharModal() {
    document.getElementById("modalAgendamento").hidden = true;
    document.body.style.overflow = "";
    agendamentoSelecionado = null;
}

function mostrarTurnoRetorno(data) {
    const aviso = document.getElementById("turnoRetornoAgendamento");
    const retorno = document.getElementById("modalAgendamento").classList.contains("schedule-return");
    aviso.hidden = !retorno || !data;
    if (aviso.hidden) return;
    const turno = turnosClinica.get(data);
    aviso.textContent = turno
        ? `${turno.periodo} · ${formatarMinutos(turno.inicio * 60)} às ${formatarMinutos((turno.fim % 24) * 60)}`
        : "Sem período de atendimento cadastrado para esta data.";
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
        if (document.getElementById("calendarioSemanal")) {
            inicioSemana = obterInicioSemana(dataAvaliacao);
            await carregarAgenda();
        } else {
            document.getElementById("btnAtualizar")?.click();
        }
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
