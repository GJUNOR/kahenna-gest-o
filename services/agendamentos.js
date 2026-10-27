"use strict";

const supabase =
    require("../config/supabase");


async function buscarAgendamentoPaciente(
    visitanteId
) {
    if (!visitanteId) {
        const erro = new Error(
            "visitante_id não informado."
        );

        erro.statusCode = 400;
        throw erro;
    }

    const { data, error } =
        await supabase
            .from("agendamentos")
            .select("*")
            .eq(
                "visitante_id",
                visitanteId
            )
            .eq("status", "agendado")
            .gte("data_avaliacao", new Date().toISOString())
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


async function criarOuAtualizarAgendamento({
    visitanteId,
    dataAvaliacao,
    observacao,
    agendamentoId
}) {
    if (!visitanteId) {
        const erro = new Error(
            "visitante_id não informado."
        );

        erro.statusCode = 400;
        throw erro;
    }

    if (!dataAvaliacao) {
        const erro = new Error(
            "A data da avaliação é obrigatória."
        );

        erro.statusCode = 400;
        throw erro;
    }

    const dataConvertida =
        new Date(dataAvaliacao);

    if (
        Number.isNaN(
            dataConvertida.getTime()
        )
    ) {
        const erro = new Error(
            "Data da avaliação inválida."
        );

        erro.statusCode = 400;
        throw erro;
    }

    let existente = null;
    if (agendamentoId !== undefined && agendamentoId !== null) {
        if (!Number.isSafeInteger(Number(agendamentoId)) || Number(agendamentoId) < 1) throw Object.assign(new Error("Agendamento inválido."), { statusCode: 400 });
        const consulta = await supabase.from("agendamentos").select("*").eq("id", agendamentoId).eq("visitante_id", visitanteId).eq("status", "agendado").maybeSingle();
        if (consulta.error) throw consulta.error;
        if (!consulta.data) throw Object.assign(new Error("Agendamento não encontrado ou já encerrado."), { statusCode: 409 });
        existente = consulta.data;
    }

    let consultaConflito = supabase
        .from("agendamentos")
        .select("id")
        .eq("data_avaliacao", dataConvertida.toISOString())
        .neq("status", "cancelado")
        .limit(1);

    if (existente) {
        consultaConflito = consultaConflito.neq(
            "id",
            existente.id
        );
    }

    const {
        data: conflitos,
        error: erroConflito
    } = await consultaConflito;

    if (erroConflito) throw erroConflito;

    if (Array.isArray(conflitos) && conflitos.length > 0) {
        const erro = new Error(
            "Este horário já possui um paciente agendado."
        );
        erro.statusCode = 409;
        throw erro;
    }

    const dados = {
        visitante_id: visitanteId,
        data_avaliacao:
            dataConvertida.toISOString(),
        status: "agendado",
        observacao:
            observacao || null
    };

    if (existente && new Date(existente.data_avaliacao).getTime() !== dataConvertida.getTime()) {
        dados.lembrete_enviado_em = null;
        dados.confirmado_em = null;
    }
    if (existente) {
        const { data, error } =
            await supabase
                .from("agendamentos")
                .update(dados)
                .eq(
                    "id",
                    existente.id
                )
                .eq("status", "agendado")
                .select("*")
                .single();

        if (error) {
            if (error.code === "23505") throw Object.assign(new Error("Este horário já está ocupado."), { statusCode: 409 });
            throw error;
        }

        await marcarPacienteComoAgendado(visitanteId);

        return data;
    }

    const { data, error } =
        await supabase
            .from("agendamentos")
            .insert(dados)
            .select("*")
            .single();

    if (error) {
        if (error.code === "23505") throw Object.assign(new Error("Este horário já está ocupado."), { statusCode: 409 });
        throw error;
    }

    await marcarPacienteComoAgendado(visitanteId);

    return data;
}

async function marcarPacienteComoAgendado(visitanteId) {
    const { error } = await supabase
        .from("visitantes")
        .update({ status: "agendado" })
        .eq("visitante_id", visitanteId)
        .neq("status", "convertido");

    if (error) throw error;
}


async function listarAgendamentosDoDia(
    inicioDia,
    fimDia
) {
    const { data, error } =
        await supabase
            .from("agendamentos")
            .select("*")
            .gte(
                "data_avaliacao",
                inicioDia
            )
            .lte(
                "data_avaliacao",
                fimDia
            )
            .neq(
                "status",
                "cancelado"
            )
            .order(
                "data_avaliacao",
                {
                    ascending: true
                }
            );

    if (error) {
        throw error;
    }

    return Array.isArray(data)
        ? data
        : [];
}

async function listarAgendamentosDoPeriodo(
    inicioPeriodo,
    fimPeriodo
) {
    const inicio = new Date(String(inicioPeriodo || ""));
    const fim = new Date(String(fimPeriodo || ""));

    if (
        Number.isNaN(inicio.getTime()) ||
        Number.isNaN(fim.getTime()) ||
        inicio.getTime() >= fim.getTime()
    ) {
        const erro = new Error(
            "Informe um período válido para a agenda."
        );
        erro.statusCode = 400;
        throw erro;
    }

    const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .gte("data_avaliacao", inicio.toISOString())
        .lt("data_avaliacao", fim.toISOString())
        .neq("status", "cancelado")
        .order("data_avaliacao", { ascending: true });

    if (error) throw error;

    const agendamentos = Array.isArray(data) ? data : [];
    const visitanteIds = [
        ...new Set(
            agendamentos
                .map((item) => String(item.visitante_id || ""))
                .filter(Boolean)
        )
    ];

    let pacientesPorId = new Map();

    if (visitanteIds.length > 0) {
        const { data: pacientes, error: erroPacientes } =
            await supabase
                .from("visitantes")
                .select("visitante_id, nome, telefone, status")
                .in("visitante_id", visitanteIds);

        if (erroPacientes) throw erroPacientes;

        pacientesPorId = new Map(
            (pacientes || []).map((paciente) => [
                String(paciente.visitante_id),
                paciente
            ])
        );
    }

    return agendamentos.map((agendamento) => ({
        ...agendamento,
        paciente:
            pacientesPorId.get(
                String(agendamento.visitante_id)
            ) || null
    }));
}

async function cancelarAgendamento(id) {
    const agendamentoId = Number(id);

    if (!Number.isInteger(agendamentoId) || agendamentoId <= 0) {
        const erro = new Error("Agendamento inválido.");
        erro.statusCode = 400;
        throw erro;
    }

    const { data, error } = await supabase
        .from("agendamentos")
        .update({ status: "cancelado" })
        .eq("id", agendamentoId)
        .select("*")
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const erro = new Error("Agendamento não encontrado.");
        erro.statusCode = 404;
        throw erro;
    }

    return data;
}


async function atualizarAcompanhamento(id, body) {
    const falha=(mensagem,statusCode=400)=>Object.assign(new Error(mensagem),{statusCode});
    const itemId=Number(id);
    if(!Number.isSafeInteger(itemId)||itemId<=0)throw falha('Agendamento inválido.');
    const values={};
    for(const [input,column] of [['lembrete_enviado','lembrete_enviado_em'],['paciente_confirmado','confirmado_em']]){
        if(Object.prototype.hasOwnProperty.call(body,input)){
            if(typeof body[input]!=='boolean')throw falha('Marcação inválida.');
            values[column]=body[input]?new Date().toISOString():null;
        }
    }
    if(!Object.keys(values).length)throw falha('Nenhuma marcação informada.');
    const {data,error}=await supabase.from('agendamentos').update(values).eq('id',itemId).neq('status','cancelado').select('*').maybeSingle();
    if(error)throw error;
    if(!data)throw falha('Agendamento não encontrado ou cancelado.',404);
    return data;
}
module.exports = {
    atualizarAcompanhamento,
    criarOuAtualizarAgendamento,
    listarAgendamentosDoDia,
    listarAgendamentosDoPeriodo,
    cancelarAgendamento,
    buscarAgendamentoPaciente
};
