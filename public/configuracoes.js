"use strict";

const lista = document.getElementById("listaEquipe");
const mensagem = document.getElementById("mensagem");
const modal = document.getElementById("modalConvite");
const form = document.getElementById("formConvite");

function mostrarMensagem(texto, erro = false) {
    mensagem.textContent = texto;
    mensagem.classList.toggle("error", erro);
    mensagem.hidden = false;
}

function iniciais(nome) {
    return nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase();
}

function formatarData(data) {
    return data ? new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(data)) : "Convite pendente";
}

async function carregarEquipe() {
    const resposta = await fetch("/api/equipe");
    const resultado = await resposta.json();

    if (!resposta.ok) {
        mostrarMensagem(resultado.mensagem || "Não foi possível carregar a equipe.", true);
        return;
    }

    document.getElementById("totalEquipe").textContent = resultado.data.length;
    document.getElementById("totalAtivos").textContent = resultado.data.filter((pessoa) => pessoa.ativo).length;

    lista.innerHTML = "";
    resultado.data.forEach((pessoa) => {
        const item = document.createElement("article");
        item.className = "member";
        item.innerHTML = `
            <div class="member-name"><span class="avatar">${iniciais(pessoa.nome)}</span><div><strong></strong><small></small></div></div>
            <div><span class="badge ${pessoa.ativo ? "" : "inactive"}">${pessoa.ativo ? "Acesso ativo" : "Desativado"}</span><p>${formatarData(pessoa.ultimo_acesso)}</p></div>
            <button class="access-button ${pessoa.ativo ? "danger" : ""}" type="button" ${pessoa.papel === "administrador" ? "disabled" : ""}>${pessoa.papel === "administrador" ? "Administrador" : pessoa.ativo ? "Desativar" : "Reativar"}</button>`;
        item.querySelector("strong").textContent = pessoa.nome;
        item.querySelector("small").textContent = pessoa.email;
        const botao = item.querySelector("button");
        if (pessoa.papel !== "administrador") {
            botao.addEventListener("click", () => alterarAcesso(pessoa.id, !pessoa.ativo));
        }
        lista.appendChild(item);
    });
}

async function alterarAcesso(id, ativo) {
    const resposta = await fetch(`/api/equipe/${encodeURIComponent(id)}/acesso`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ativo })
    });
    const resultado = await resposta.json();
    mostrarMensagem(resultado.mensagem, !resposta.ok);
    if (resposta.ok) await carregarEquipe();
}

function fecharModal() { modal.hidden = true; form.reset(); }
document.getElementById("abrirConvite").addEventListener("click", () => { modal.hidden = false; document.getElementById("nome").focus(); });
document.getElementById("fecharConvite").addEventListener("click", fecharModal);
document.getElementById("cancelarConvite").addEventListener("click", fecharModal);
modal.addEventListener("click", (evento) => { if (evento.target === modal) fecharModal(); });

form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const botao = document.getElementById("enviarConvite");
    botao.disabled = true;
    const resposta = await fetch("/api/equipe/convites", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ nome:form.nome.value, email:form.email.value })
    });
    const resultado = await resposta.json();
    botao.disabled = false;
    mostrarMensagem(resultado.mensagem, !resposta.ok);
    if (resposta.ok) { fecharModal(); await carregarEquipe(); }
});

carregarEquipe().catch(() => mostrarMensagem("Não foi possível carregar a equipe.", true));
