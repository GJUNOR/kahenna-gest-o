'use strict';
(() => {
    let frame;
    function ajustar(campo) {
        if (!campo.getClientRects().length) return;
        campo.style.setProperty('height', 'auto', 'important');
        const estilo = getComputedStyle(campo);
        const bordas = parseFloat(estilo.borderTopWidth) + parseFloat(estilo.borderBottomWidth);
        campo.style.setProperty('height', Math.max(48, campo.scrollHeight + bordas) + 'px', 'important');
    }
    function atualizar() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            document.querySelectorAll('textarea[data-autosize]').forEach(ajustar);
        });
    }
    document.addEventListener('input', evento => {
        if (evento.target.matches('textarea[data-autosize]')) ajustar(evento.target);
    });
    window.addEventListener('resize', atualizar);
    document.addEventListener('reset', atualizar);
    document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(atualizar).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['hidden', 'open', 'class']
        });
        atualizar();
    });
})();
