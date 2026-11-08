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
    for (const link of [...links,...document.querySelectorAll('.crm-mobile-nav a,.crm-mobile-grid a')]) {
        const ativo = new URL(link.href).pathname === pathname;
        link.classList.toggle('active', ativo);
        if (ativo) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }
    const mais=document.getElementById('crmMobileAbrirMais');if(mais)mais.classList.toggle('active',!['/dashboard.html','/leads.html','/agenda.html'].includes(pathname));
}

function abrirSecao(destino, registrar = true) {
    document.getElementById('crmMobileMais')?.close();
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

const svg=(conteudo)=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+conteudo+'</svg>';
const navCelular=document.createElement('nav');navCelular.className='crm-mobile-nav';navCelular.setAttribute('aria-label','Navegação do celular');
const paginasPrincipais=['/dashboard.html','/leads.html','/agenda.html'];
for(const caminho of paginasPrincipais){const original=links.find(l=>new URL(l.href).pathname===caminho);if(original){const item=original.cloneNode(true);item.removeAttribute('class');navCelular.append(item);}}
const buscaCelular=document.createElement('button');buscaCelular.type='button';buscaCelular.setAttribute('aria-label','Busca geral');buscaCelular.innerHTML=svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>')+'<span>Buscar</span>';buscaCelular.onclick=()=>busca.click();navCelular.append(buscaCelular);
const maisCelular=document.createElement('button');maisCelular.type='button';maisCelular.id='crmMobileAbrirMais';maisCelular.setAttribute('aria-label','Mais seções');maisCelular.setAttribute('aria-expanded','false');maisCelular.setAttribute('aria-controls','crmMobileMais');maisCelular.innerHTML=svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>')+'<span>Mais</span>';navCelular.append(maisCelular);
const maisJanela=document.createElement('dialog');maisJanela.id='crmMobileMais';maisJanela.className='crm-mobile-mais';maisJanela.setAttribute('aria-labelledby','crmMobileTitulo');maisJanela.innerHTML='<header><div><span>KAHENNA</span><h2 id="crmMobileTitulo">Seu CRM</h2></div><button type="button" aria-label="Fechar menu">'+svg('<path d="m6 6 12 12M18 6 6 18"/>')+'</button></header><div class="crm-mobile-grid"></div>';
for(const original of links.filter(l=>!l.hidden&&!paginasPrincipais.includes(new URL(l.href).pathname))){const item=original.cloneNode(true);item.removeAttribute('class');maisJanela.querySelector('.crm-mobile-grid').append(item);}
const sairCelular=document.createElement('button');sairCelular.type='button';sairCelular.className='crm-mobile-sair';sairCelular.innerHTML=svg('<path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/>')+'<span>Sair da conta</span>';sairCelular.onclick=()=>{sairCelular.disabled=true;document.querySelector('.sidebar [data-logout]')?.click();};maisJanela.append(sairCelular);
maisCelular.onclick=()=>{if(!maisJanela.open)maisJanela.showModal();maisCelular.setAttribute('aria-expanded','true');};maisJanela.querySelector('header button').onclick=()=>maisJanela.close();maisJanela.addEventListener('close',()=>{maisCelular.setAttribute('aria-expanded','false');maisCelular.focus();});maisJanela.addEventListener('click',e=>{if(e.target===maisJanela){const r=maisJanela.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)maisJanela.close();}});
navCelular.addEventListener('click',navegar);maisJanela.addEventListener('click',navegar);document.body.append(navCelular,maisJanela);document.body.classList.add('crm-com-menu-mobile');
matchMedia('(max-width:760px),(max-width:980px) and (max-height:500px) and (pointer:coarse)').addEventListener('change',e=>{if(!e.matches&&maisJanela.open)maisJanela.close();});
abrirSecao(new URL(location.href), false);
