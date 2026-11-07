'use strict';
const path=require('node:path');
const {obterPapel}=require('./auth');
const fsSync=require('node:fs');
const fichaHTML=fsSync.readFileSync(path.join(__dirname,'../public/crm-paciente.html'),'utf8');
const pdfHTML=fsSync.readFileSync(path.join(__dirname,'../public/documentos-dialog.html'),'utf8');
const agendaHTML=fsSync.readFileSync(path.join(__dirname,'../public/agenda.html'),'utf8');
const agendaFormulario=agendaHTML.slice(agendaHTML.indexOf('<div class="schedule-modal"'),agendaHTML.indexOf('<script src="/auth-ui.js"'));
const PAGINAS=['dashboard.html','leads.html','agenda.html','estoque.html','configuracoes.html'];
const MENU=[['dashboard.html','Visão Geral','fa-chart-column',false],['leads.html','Pacientes','fa-user-group',false],['agenda.html','Agenda','fa-calendar-days',false],['estoque.html','Estoque','fa-boxes-stacked',true],['configuracoes.html','Equipe','fa-users-gear',true]];
function prepararCampos(html){
 return html.replace(/<(form|input|textarea)\b[^>]*>/gi,(tag,tipo)=>{
  if(tipo==='input'&&/\btype\s*=\s*["'](?:hidden|password|file|checkbox|radio)["']/i.test(tag))return tag;
  const atributos=tipo==='form'?{autocomplete:'off'}:{
   autocomplete:'off',autocorrect:'off',autocapitalize:'off',spellcheck:'false'
  };
  let campo=tag.slice(0,-1);
  for(const [nome,valor] of Object.entries(atributos)){
   campo=campo.replace(new RegExp('\\s'+nome+'\\s*=\\s*(?:"[^"]*"|\'[^\']*\')','gi'),'');
   campo+=' '+nome+'="'+valor+'"';
  }
  return campo+'>';
 });
}
function renderizarPagina(html,papel,arquivo){
 const role=papel==='administrador'?'administrador':'secretaria';
 const linkMenu=([pagina,label,icone,admin],classe='')=>{
  const ativo=pagina===arquivo;
  const classes=[classe,ativo?'active':''].filter(Boolean).join(' ');
  return `<a href="/${pagina}"${classes?' class="'+classes+'"':''}${ativo?' aria-current="page"':''}${admin?' data-admin-only'+(role==='administrador'?'':' hidden'):''}><i class="fa-solid ${icone}" aria-hidden="true"></i><span>${label}</span></a>`;
 };
 const menu=MENU.slice(0,-1).map(item=>linkMenu(item)).join('\n');
 let page=html.replace('/mobile-refined.css?v=35','/mobile-refined.css?v=39').replace(/<body([^>]*)>/i,(_,attrs)=>`<body${attrs.replace(/\sdata-crm-role="[^"]*"/g,'')} data-crm-role="${role}">`).replace(/<nav\s+class="menu"[^>]*>[\s\S]*?<\/nav>/i,`<nav class="menu" aria-label="Navegação principal">${menu}</nav>`);
 const origens=['https://cdnjs.cloudflare.com','https://fonts.googleapis.com','https://fonts.gstatic.com'];
 page=page.replace('<div class="sidebar-bottom">','<div class="sidebar-bottom">'+linkMenu(MENU.at(-1),'sidebar-equipe'));
 const conexoes=origens.filter(origem=>!page.includes('href="'+origem+'"'))
  .map(origem=>'<link rel="preconnect" href="'+origem+'"'+(origem.endsWith('gstatic.com')?' crossorigin':'')+'>').join('');
 page=page.replace('<head>','<head><link rel="icon" href="/favicon.ico?v=1" sizes="any">'+conexoes)
  .replace('/font-awesome/6.5.2/css/all.min.css','/font-awesome/6.7.2/css/all.min.css');
 let extra=fichaHTML;
 if(arquivo==='dashboard.html'){
  page=page.replace('<link rel="stylesheet" href="/kahenna-theme.css', '<link rel="stylesheet" href="/agenda-form.css?v=4"><link rel="stylesheet" href="/kahenna-theme.css');
  extra+=agendaFormulario+'<script src="/agenda.js?v=20"></script>';
 }
 if(role==='administrador'&&!page.includes('id="documentosDialog"')){extra+=pdfHTML+'<script src="/documentos.js?v=4"></script>';page=page.replace('</head>','<link rel="stylesheet" href="/documentos.css?v=3"></head>');}
 return prepararCampos(page.replace('</head>','<link rel="stylesheet" href="/crm-paciente.css?v=5"></head>').replace('</body>',extra+'<script src="/crm-paciente.js?v=9"></script></body>'));
}
const paginasPorPapel=new Map(PAGINAS.map(arquivo=>{
 const html=fsSync.readFileSync(path.join(__dirname,'../public',arquivo),'utf8');
 return [arquivo,{
  administrador:renderizarPagina(html,'administrador',arquivo),
  secretaria:renderizarPagina(html,'secretaria',arquivo)
 }];
}));
function montarEstrutura(html,papel,arquivo){
 const cabecalho=paginasPorPapel.get('dashboard.html')[papel].match(/<head>[\s\S]*?<\/head>/)[0];
 const titulo=html.match(/<title>[\s\S]*?<\/title>/)[0];
 const menu=html.match(/<aside class="sidebar">[\s\S]*?<\/aside>/)[0];
 return `<!doctype html><html lang="pt-BR">${cabecalho.replace(/<title>[\s\S]*?<\/title>/,titulo).replace('</head>',`
 <style>
 .crm-painel { position:fixed; inset:0 0 0 var(--atlas-sidebar-width); width:calc(100% - var(--atlas-sidebar-width)); height:100%; border:0; }
 @media(max-width:760px){.crm-painel{inset:0 0 auto;width:100%;height:calc(100% - 72px - env(safe-area-inset-bottom));}}
 </style></head>`)}
 <body class="crm-page" data-crm-role="${papel}" data-crm-secao="${arquivo}">${menu}
 <iframe class="crm-painel" id="crmPainel" title="Seção do CRM"></iframe>
 <script src="/auth-ui.js"></script><script src="/crm-navegacao.js?v=2"></script>
 </body></html>`;
}
const estiloPainel=`<style>
 body.crm-page { --atlas-sidebar-width:0px; padding-bottom:0!important; }
 body.crm-page .sidebar { display:none!important; }
 </style>`;
async function enviarPagina(req,res,arquivo){
 if(!PAGINAS.includes(arquivo))throw new Error('Página não permitida.');
 const papel=obterPapel(req.usuario)==='administrador'?'administrador':'secretaria';
 const html=paginasPorPapel.get(arquivo)[papel];
 const interno=req.get('sec-fetch-dest')==='iframe'||req.query.painel==='1';
 res.set('Cache-Control','no-store');
 return res.type('html').send(interno?html.replace('</head>',estiloPainel+'</head>'):montarEstrutura(html,papel,arquivo));
}
module.exports={enviarPagina,renderizarPagina,PAGINAS};
