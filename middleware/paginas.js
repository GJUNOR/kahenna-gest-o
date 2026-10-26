'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {obterPapel}=require('./auth');
const PAGINAS=['dashboard.html','leads.html','agenda.html','estoque.html','configuracoes.html'];
const MENU=[['dashboard.html','Visão Geral','fa-chart-column',false],['leads.html','Pacientes','fa-user-group',false],['agenda.html','Agenda','fa-calendar-days',false],['estoque.html','Estoque','fa-boxes-stacked',true],['configuracoes.html','Equipe','fa-users-gear',true]];
function renderizarPagina(html,papel,arquivo){
 const role=papel==='administrador'?'administrador':'secretaria';
 const menu=MENU.map(([pagina,label,icone,admin])=>`<a href="/${pagina}"${pagina===arquivo?' class="active" aria-current="page"':''}${admin?' data-admin-only'+(role==='administrador'?'':' hidden'):''}><i class="fa-solid ${icone}" aria-hidden="true"></i><span>${label}</span></a>`).join('\n');
 return html.replace(/<body([^>]*)>/i,(_,attrs)=>`<body${attrs.replace(/\sdata-crm-role="[^"]*"/g,'')} data-crm-role="${role}">`).replace(/<nav\s+class="menu"[^>]*>[\s\S]*?<\/nav>/i,`<nav class="menu" aria-label="Navegação principal">${menu}</nav>`);
}
async function enviarPagina(req,res,arquivo){
 if(!PAGINAS.includes(arquivo))throw new Error('Página não permitida.');
 const html=await fs.readFile(path.join(__dirname,'../public',arquivo),'utf8');
 res.set('Cache-Control','no-store');return res.type('html').send(renderizarPagina(html,obterPapel(req.usuario),arquivo));
}
module.exports={enviarPagina,renderizarPagina,PAGINAS};
