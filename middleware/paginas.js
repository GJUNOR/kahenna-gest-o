'use strict';
const path=require('node:path');
const {obterPapel}=require('./auth');
const fsSync=require('node:fs');
const esteticaHTML=fsSync.readFileSync(path.join(__dirname,'../public/estetica.html'),'utf8');
const notasHTML=fsSync.readFileSync(path.join(__dirname,'../public/notas.html'),'utf8');
const fichaHTML=fsSync.readFileSync(path.join(__dirname,'../public/crm-paciente.html'),'utf8');
const pdfHTML=fsSync.readFileSync(path.join(__dirname,'../public/documentos-dialog.html'),'utf8');
const agendaHTML=fsSync.readFileSync(path.join(__dirname,'../public/agenda.html'),'utf8');
const agendaFormulario=agendaHTML.slice(agendaHTML.indexOf('<div class="schedule-modal"'),agendaHTML.indexOf('<script src="/auth-ui.js"'));
const materiaisHTML=fsSync.readFileSync(path.join(__dirname,'../views/estoque-materiais.html'),'utf8');
const PAGINAS=['dashboard.html','leads.html','agenda.html','estoque.html','orcamentos.html','fornecedores.html','arquivos.html','configuracoes.html'];
const MENU=[['dashboard.html','Início','fa-chart-column',false],['leads.html','Pacientes','fa-user-group',false],['agenda.html','Agenda','fa-calendar-days',false],['estoque.html','Caixa','fa-wallet',true],['orcamentos.html','Orçamentos','fa-file-invoice-dollar',true],['fornecedores.html','Fornecedores','fa-truck-field',true],['arquivos.html','Arquivos','fa-folder-open',true],['configuracoes.html','Equipe','fa-users-gear',true]];
const ICONES_MENU={
 'orcamentos.html':'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
 'dashboard.html':'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 'leads.html':'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',
 'agenda.html':'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M15 15h2M7 18h2"/>',
 'estoque.html':'<path d="M20 8V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0 0 4h15v10H5a2 2 0 0 1-2-2V8"/><path d="M20 13h-5v4h5"/><circle cx="17" cy="15" r=".5"/>',
 'fornecedores.html':'<path d="M3 5h11v13H3zM14 10h4l3 4v4h-7M3 10h11"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
 'arquivos.html':'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
 'configuracoes.html':'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 9-5M18 11v2M18 21v2M12 17h2M22 17h2M14 13l1 1M21 20l1 1M14 21l1-1M21 14l1-1"/><circle cx="18" cy="17" r="4"/>'
};
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
  return `<a href="/${pagina}"${classes?' class="'+classes+'"':''}${ativo?' aria-current="page"':''}${admin?' data-admin-only'+(role==='administrador'?'':' hidden'):''}><i class="crm-nav-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONES_MENU[pagina]}</svg></i><span>${label}</span></a>`;
 };
 const menu=MENU.slice(0,-1).map(item=>linkMenu(item)).join('\n');
 let page=html.replace(/<div class="connection-status[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i,'').replace('/crm-controls.css?v=2','/crm-controls.css?v=4').replace('/mobile-refined.css?v=35','/mobile-refined.css?v=43').replace(/<body([^>]*)>/i,(_,attrs)=>`<body${attrs.replace(/\sdata-crm-role="[^"]*"/g,'')} data-crm-role="${role}">`).replace(/<nav\s+class="menu"[^>]*>[\s\S]*?<\/nav>/i,`<nav class="menu" aria-label="Navegação principal">${menu}</nav>`);
 const origens=['https://cdnjs.cloudflare.com','https://fonts.googleapis.com','https://fonts.gstatic.com'];
 page=page.replace('<div class="sidebar-bottom">','<div class="sidebar-bottom">'+linkMenu(MENU.at(-1),'sidebar-equipe'));
 const conexoes=origens.filter(origem=>!page.includes('href="'+origem+'"'))
  .map(origem=>'<link rel="preconnect" href="'+origem+'"'+(origem.endsWith('gstatic.com')?' crossorigin':'')+'>').join('');
 page=page.replace('<head>','<head><link rel="icon" href="/favicon.ico?v=1" sizes="any">'+conexoes)
  .replace('/font-awesome/6.5.2/css/all.min.css','/font-awesome/6.7.2/css/all.min.css');
 let extra='<script src="/paciente-busca.js?v=2"></script>'+esteticaHTML+'<script src="/rosto-clinico.js?v=1"></script><script src="/estetica.js?v=2"></script>'+fichaHTML+'<script src="/campos-ui.js?v=2"></script>';
 if(arquivo==='estoque.html'){extra+=notasHTML+'<script src="/notas.js?v=1"></script>';page=page.replace('</head>','<link rel="stylesheet" href="/notas.css?v=1"></head>');}
 if(arquivo==='dashboard.html'){
  page=page.replace('<link rel="stylesheet" href="/kahenna-theme.css', '<link rel="stylesheet" href="/agenda-form.css?v=4"><link rel="stylesheet" href="/kahenna-theme.css');
  extra+=agendaFormulario+'<script src="/agenda.js?v=22"></script>';
 }
 if(role==='administrador'&&!page.includes('id="documentosDialog"')){extra+=pdfHTML+'<script src="/documentos.js?v=4"></script>';page=page.replace('</head>','<link rel="stylesheet" href="/documentos.css?v=3"></head>');}
 return prepararCampos(page.replace('</head>','<link rel="stylesheet" href="/crm-paciente.css?v=5"><link rel="stylesheet" href="/estetica.css?v=2"><link rel="stylesheet" href="/refino-ui.css?v=5"></head>').replace('</body>',extra+'<script src="/crm-paciente.js?v=12"></script></body>'));
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
 @media(max-width:760px){.crm-painel{inset:0 0 auto;width:100%;height:calc(100% - 120px - env(safe-area-inset-bottom));}}
 </style></head>`)}
 <body class="crm-page" data-crm-role="${papel}" data-crm-secao="${arquivo}">${menu}
 <iframe class="crm-painel" id="crmPainel" title="Seção do CRM"></iframe>
 <script src="/auth-ui.js"></script><script src="/crm-navegacao.js?v=2"></script>
 </body></html>`;
}
const estiloPainel=`<style>
 html body.crm-page { --atlas-sidebar-width:0px; padding-bottom:0!important; }
 body.crm-page .sidebar { display:none!important; }
 </style>`;
async function enviarPagina(req,res,arquivo){
 if(!PAGINAS.includes(arquivo))throw new Error('Página não permitida.');
 const papel=obterPapel(req.usuario)==='administrador'?'administrador':'secretaria';
 const html=arquivo==='estoque.html'&&req.query.novo_atendimento==='1'
  ?renderizarPagina(materiaisHTML,papel,arquivo)
  :paginasPorPapel.get(arquivo)[papel];
 const interno=req.get('sec-fetch-dest')==='iframe'||req.query.painel==='1';
 res.set('Cache-Control','no-store');
 return res.type('html').send(interno?html.replace('</head>',estiloPainel+'</head>'):montarEstrutura(html,papel,arquivo));
}
module.exports={enviarPagina,renderizarPagina,PAGINAS};
