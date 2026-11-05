'use strict';
const path=require('node:path');
const {obterPapel}=require('./auth');
const fsSync=require('node:fs');
const fichaHTML=fsSync.readFileSync(path.join(__dirname,'../public/crm-paciente.html'),'utf8');
const pdfHTML=fsSync.readFileSync(path.join(__dirname,'../public/documentos-dialog.html'),'utf8');
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
 const menu=MENU.map(([pagina,label,icone,admin])=>`<a href="/${pagina}"${pagina===arquivo?' class="active" aria-current="page"':''}${admin?' data-admin-only'+(role==='administrador'?'':' hidden'):''}><i class="fa-solid ${icone}" aria-hidden="true"></i><span>${label}</span></a>`).join('\n');
 let page=html.replace(/<body([^>]*)>/i,(_,attrs)=>`<body${attrs.replace(/\sdata-crm-role="[^"]*"/g,'')} data-crm-role="${role}">`).replace(/<nav\s+class="menu"[^>]*>[\s\S]*?<\/nav>/i,`<nav class="menu" aria-label="Navegação principal">${menu}</nav>`);
 const origens=['https://cdnjs.cloudflare.com','https://fonts.googleapis.com','https://fonts.gstatic.com'];
 const conexoes=origens.filter(origem=>!page.includes('href="'+origem+'"'))
  .map(origem=>'<link rel="preconnect" href="'+origem+'"'+(origem.endsWith('gstatic.com')?' crossorigin':'')+'>').join('');
 page=page.replace('<head>','<head>'+conexoes)
  .replace('/font-awesome/6.5.2/css/all.min.css','/font-awesome/6.7.2/css/all.min.css');
 let extra=fichaHTML;
 if(role==='administrador'&&!page.includes('id="documentosDialog"')){extra+=pdfHTML+'<script src="/documentos.js?v=4"></script>';page=page.replace('</head>','<link rel="stylesheet" href="/documentos.css?v=3"></head>');}
 return prepararCampos(page.replace('</head>','<link rel="stylesheet" href="/crm-paciente.css?v=5"></head>').replace('</body>',extra+'<script src="/crm-paciente.js?v=7"></script></body>'));
}
const paginasPorPapel=new Map(PAGINAS.map(arquivo=>{
 const html=fsSync.readFileSync(path.join(__dirname,'../public',arquivo),'utf8');
 return [arquivo,{
  administrador:renderizarPagina(html,'administrador',arquivo),
  secretaria:renderizarPagina(html,'secretaria',arquivo)
 }];
}));
async function enviarPagina(req,res,arquivo){
 if(!PAGINAS.includes(arquivo))throw new Error('Página não permitida.');
 const papel=obterPapel(req.usuario)==='administrador'?'administrador':'secretaria';
 res.set('Cache-Control','no-store');return res.type('html').send(paginasPorPapel.get(arquivo)[papel]);
}
module.exports={enviarPagina,renderizarPagina,PAGINAS};
