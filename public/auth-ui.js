"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const botoes = document.querySelectorAll("[data-logout]");

    botoes.forEach((botao) => {
        botao.addEventListener("click", async () => {
            botao.disabled = true;

            try {
                await fetch("/api/auth/logout", {
                    method: "POST"
                });
            } finally {
                window.location.replace("/login.html");
            }
        });
    });
});
