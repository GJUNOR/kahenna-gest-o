"use strict";
// Page authorization is checked on the server before these navigation hints are rendered.
document.addEventListener("DOMContentLoaded", async () => {
    const aplicar = papel => {
        const administrador = papel === "administrador";
        document.querySelectorAll("[data-admin-only]").forEach(elemento => { elemento.hidden = !administrador; });
        document.body.dataset.crmSessionReady = "true";
    };
    const papelDaPagina = document.body.dataset.crmRole;
    if (["administrador", "secretaria"].includes(papelDaPagina)) {
        aplicar(papelDaPagina);
        return;
    }
    // Fallback for local previews; this never grants API or page permissions.
    try {
        const resposta = await fetch("/api/auth/session", {credentials: "same-origin", cache: "no-store"});
        if (!resposta.ok) return;
        const resultado = await resposta.json();
        aplicar(resultado.usuario?.papel);
    } catch { console.warn("Não foi possível carregar o perfil da sessão."); }
});
