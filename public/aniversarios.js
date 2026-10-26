"use strict";
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.KahennaAniversarios = factory();
})(typeof window === "object" ? window : this, function () {
    function hojeBrasil(agora = new Date()) {
        const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
        const valor = tipo => partes.find(p => p.type === tipo).value;
        return `${valor("year")}-${valor("month")}-${valor("day")}`;
    }
    function normalizarNascimento(valor, agora = new Date()) {
        if (valor === null || valor === "" || valor === undefined) return null;
        const falha = () => Object.assign(new Error("Informe uma data de nascimento válida, que não seja futura."), { statusCode: 400 });
        if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw falha();
        const data = new Date(`${valor}T12:00:00Z`);
        if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor || valor < "1900-01-01" || valor > hojeBrasil(agora)) throw falha();
        return valor;
    }
    function aniversariantesHoje(pacientes, agora = new Date()) {
        const hoje = hojeBrasil(agora);
        return pacientes.filter(p => {
            try { return normalizarNascimento(p.data_nascimento, agora)?.slice(5) === hoje.slice(5); }
            catch { return false; }
        }).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    }
    function linkParabens(paciente) {
        let numero = String(paciente.telefone || "").replace(/\D/g, "");
        if (/^(\d)\1+$/.test(numero)) return null;
        if (numero.length === 10 || numero.length === 11) numero = "55" + numero;
        if (!/^[1-9]\d{9,14}$/.test(numero)) return null;
        const nome = String(paciente.nome || "").trim().split(/\s+/)[0] || "";
        const mensagem = `Olá${nome ? ", " + nome : ""}! Feliz aniversário! Desejamos um dia especial, com muita saúde, alegria e realizações. Um abraço da Dra. Kahenna e equipe!`;
        return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
    }
    return { hojeBrasil, normalizarNascimento, aniversariantesHoje, linkParabens };
});
