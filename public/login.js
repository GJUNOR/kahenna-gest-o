"use strict";

const formLogin = document.getElementById("formLogin");
const btnEntrar = document.getElementById("btnEntrar");
const mensagemLogin = document.getElementById("mensagemLogin");

function obterDestino() {
    const destino = new URLSearchParams(
        window.location.search
    ).get("destino");

    if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.includes("\\")) {
        return "/dashboard.html";
    }

    return destino;
}

formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    mensagemLogin.textContent = "";
    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";

    try {
        const resposta = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario: formLogin.usuario.value,
                senha: formLogin.senha.value
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.mensagem || "Não foi possível entrar."
            );
        }

        window.location.replace(obterDestino());
    } catch (erro) {
        mensagemLogin.textContent = erro.message;
        btnEntrar.disabled = false;
        btnEntrar.textContent = "Entrar";
    }
});
