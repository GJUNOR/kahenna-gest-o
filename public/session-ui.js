"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const resposta = await fetch("/api/auth/session", {
            credentials: "same-origin"
        });

        if (!resposta.ok) {
            return;
        }

        const resultado = await resposta.json();
        const administrador =
            resultado.usuario?.papel === "administrador";

        document.querySelectorAll("[data-admin-only]")
            .forEach((elemento) => {
                elemento.hidden = !administrador;
            });
    } catch (erro) {
        console.warn("Não foi possível carregar o perfil da sessão.");
    }
});
