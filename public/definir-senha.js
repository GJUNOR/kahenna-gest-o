"use strict";

const parametros = new URLSearchParams(location.hash.replace(/^#/, ""));
const accessToken = parametros.get("access_token") || "";
const formulario = document.getElementById("formSenha");
const mensagem = document.getElementById("mensagem");

if (!accessToken) {
    mensagem.textContent = "Este convite é inválido ou expirou.";
    mensagem.hidden = false;
    formulario.hidden = true;
}

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const senha = document.getElementById("senha").value;
    const confirmacao = document.getElementById("confirmacao").value;
    if (senha !== confirmacao) {
        mensagem.textContent = "As senhas não são iguais.";
        mensagem.hidden = false;
        return;
    }
    const resposta = await fetch("/api/auth/definir-senha", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ access_token:accessToken, senha })
    });
    const resultado = await resposta.json();
    mensagem.textContent = resultado.mensagem;
    mensagem.classList.toggle("success", resposta.ok);
    mensagem.hidden = false;
    if (resposta.ok) {
        formulario.hidden = true;
        history.replaceState(null, "", location.pathname);
        setTimeout(() => location.replace("/login.html"), 1800);
    }
});
