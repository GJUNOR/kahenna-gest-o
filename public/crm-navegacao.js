'use strict';

const painel = document.getElementById('crmPainel');
const menu = document.querySelector('.sidebar .menu');
const links = [...document.querySelectorAll('.sidebar .menu a[href], .sidebar-equipe[href]')];
const secoes = new Set(links.map(link => new URL(link.href).pathname));

function urlSecao(url) {
    const destino = new URL(url, location.origin);
    return destino.origin === location.origin && secoes.has(destino.pathname) ? destino : null;
}

function marcarSecao(pathname) {
    for (const link of links) {
        const ativo = new URL(link.href).pathname === pathname;
        link.classList.toggle('active', ativo);
        if (ativo) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }
}

function abrirSecao(destino, registrar = true) {
    if (registrar && destino.href !== location.href) history.pushState(null, '', destino);
    marcarSecao(destino.pathname);
    painel.setAttribute('aria-busy', 'true');
    painel.contentWindow.location.replace(destino.href);
}

function navegar(evento) {
    const link = evento.target.closest('a[href]');
    if (!link || evento.defaultPrevented || evento.button !== 0 || evento.ctrlKey ||
        evento.metaKey || evento.altKey || evento.shiftKey || link.target || link.hasAttribute('download')) return;
    const destino = urlSecao(link.href);
    if (!destino) return;
    evento.preventDefault();
    abrirSecao(destino);
}

menu.closest('.sidebar').addEventListener('click', navegar);
window.addEventListener('popstate', () => {
    const destino = urlSecao(location.href);
    if (destino) abrirSecao(destino, false);
});

painel.addEventListener('load', () => {
    const janela = painel.contentWindow;
    const endereco = janela.location.href;
    if (endereco === 'about:blank') return;
    const destino = urlSecao(endereco);
    if (!destino) {
        const redirecionamento = new URL(endereco);
        if (redirecionamento.origin === location.origin && redirecionamento.pathname === '/login.html') {
            location.replace(redirecionamento);
        }
        painel.removeAttribute('aria-busy');
        return;
    }
    if (destino.href !== location.href) history.replaceState(null, '', destino);
    marcarSecao(destino.pathname);
    const documento = janela.document;
    document.title = documento.title;
    documento.addEventListener('click', navegar);
    painel.removeAttribute('aria-busy');
});

const busca = document.createElement('button');
busca.type = 'button';
busca.className = 'crm-global-search';
busca.setAttribute('aria-label', 'Busca geral');
busca.innerHTML = '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Buscar</span>';
menu.before(busca);
busca.addEventListener('click', () => painel.contentDocument?.querySelector('.crm-global-search')?.click());
window.addEventListener('keydown', evento => {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        busca.click();
    }
});

abrirSecao(new URL(location.href), false);
