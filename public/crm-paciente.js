'use strict';
(()=>{
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),qtd=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
 const data=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
 const dia=v=>String(v||'').slice(0,10).split('-').reverse().join('/');
 const nomes={atendimentos:'Atendimentos e agenda',materiais:'Materiais utilizados',financeiro:'Financeiro',documentos:'PDFs do prontuário'};
 const rotulos={pacientes:'Pacientes',agenda:'Agenda',produtos:'Produtos',lotes:'Lotes',documentos:'PDFs'};
 const estados={agendado:'Agendado',realizado:'Realizado',cancelado:'Cancelado'};
 const statusPaciente=v=>String(v||'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
 const foneBonito=v=>{let n=String(v||'').replace(/\D/g,'');if([12,13].includes(n.length)&&n.startsWith('55'))n=n.slice(2);return [10,11].includes(n.length)?'('+n.slice(0,2)+') '+n.slice(2,-4)+'-'+n.slice(-4):String(v||'');};
 let ficha=null,fichaTicket=0,fichaFoco,secCache=new Map(),secTickets=new Map();
 let buscaTicket=0,buscaPagina=0,buscaGrupos={},buscaMais=false,buscaOcupada=false,buscaFoco,buscaTimer;
 const avisos=new Map(),revisoes=new Map();
 async function json(url,op={}){const r=await fetch(url,{cache:'no-store',...op,headers:{Accept:'application/json',...(op.body?{'Content-Type':'application/json'}:{}),...op.headers}});if(r.status===401){location.replace('/login.html');throw Error('Sua sessão expirou.');}const d=await r.json();if(!r.ok)throw Error(d.mensagem||'Não foi possível consultar.');return d;}
 const urlFicha=id=>'/api/clinica/pacientes/'+encodeURIComponent(id);
 function perfilLead(){return {...ficha.paciente,visitante_id:ficha.paciente.id};}
 function whatsapp(fone){let n=String(fone||'').replace(/\D/g,'');if([10,11].includes(n.length))n='55'+n;return /^55\d{10,11}$/.test(n)?'https://wa.me/'+n:null;}
 async function abrir(id,secao=null){
  if(!/^[a-f0-9-]{36}$/i.test(String(id)))return;
  if($('crmBusca').open)$('crmBusca').close();if(!$('crmFicha').open)fichaFoco=document.activeElement;
  const ticket=++fichaTicket;ficha=null;secCache.clear();secTickets.clear();$('crmFichaNome').textContent='Paciente';$('crmFichaContato').textContent='';$('crmFichaConteudo').hidden=true;$('crmFichaEstado').textContent='Carregando ficha…';$('crmFichaEstado').classList.remove('crm-error');
  $('crmFichaSecoes').querySelectorAll('details').forEach(d=>{d.open=false;d.querySelector('[data-crm-lista]').replaceChildren();});if(!$('crmFicha').open)$('crmFicha').showModal();
  try{
   const d=await json(urlFicha(id));if(ticket!==fichaTicket||!$('crmFicha').open)return;ficha=d;
   $('crmFichaNome').textContent=d.paciente.nome;$('crmFichaContato').textContent=[foneBonito(d.paciente.telefone),statusPaciente(d.paciente.status)].filter(Boolean).join(' · ');
   $('crmFichaProximo').textContent=d.proximo?data(d.proximo.data):'Sem agendamento';$('crmFichaRecebido').textContent=money(d.recebido);
   const link=whatsapp(d.paciente.telefone);$('crmFichaWhatsapp').hidden=!link;if(link)$('crmFichaWhatsapp').href=link;else $('crmFichaWhatsapp').removeAttribute('href');
   for(const s of Object.keys(nomes)){const detalhe=$('crmFichaSecoes').querySelector(`[data-crm-secao="${s}"]`);detalhe.hidden=['materiais','documentos'].includes(s)&&!d.permissoes[s];detalhe.querySelector('[data-crm-contagem]').textContent=d.contagens[s]??'';}
   $('crmFichaSecoes').querySelector('[data-crm-acao="materiais"]').hidden=!d.permissoes.materiais;
   $('crmFichaEstado').textContent='';$('crmFichaConteudo').hidden=false;
   const alvo=Object.hasOwn(nomes,secao)?$('crmFichaSecoes').querySelector(`[data-crm-secao="${secao}"]`):null;if(alvo&&!alvo.hidden)alvo.open=true;
  }catch(e){if(ticket===fichaTicket){$('crmFichaEstado').textContent=e.message;$('crmFichaEstado').classList.add('crm-error');}}
 }
 function renderSecao(s,d){
  const el=$('crmFichaSecoes').querySelector(`[data-crm-lista="${s}"]`);let html='';
  if(!d.itens.length)html='<p class="crm-empty">Nenhum registro</p>';
  else html=d.itens.map(i=>{
   if(s==='atendimentos')return `<article class="crm-entry"><div class="crm-entry-head"><strong>${esc(data(i.data_avaliacao))}</strong><span>${esc(estados[i.status]||i.status)}</span></div>${i.observacao?`<p>${esc(i.observacao)}</p>`:''}${i.confirmado_em?'<small>Presença confirmada</small>':''}</article>`;
   if(s==='financeiro')return `<article class="crm-entry"><div class="crm-entry-head"><strong>${esc(i.descricao)}</strong><strong class="crm-entry-cost">${i.tipo==='reembolso'?'− ':''}${money(i.valor)}</strong></div><small>${esc(data(i.criado_em))} · ${esc(i.tipo==='reembolso'?'Reembolso':({pix:'Pix',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito'}[i.forma_pagamento]||'Pagamento'))}${Number(i.parcelas)>1?' · '+Number(i.parcelas)+'x':''}</small></article>`;
   if(s==='materiais')return `<article class="crm-entry"><div class="crm-entry-head"><strong>${esc(i.descricao)}</strong><strong class="crm-entry-cost">${money(i.custo_total)}</strong></div><small>${esc(dia(i.ocorrido_em))}</small><ul class="crm-entry-items">${i.itens.map(m=>`<li><span>${esc(m.nome)} · ${qtd(m.quantidade)} ${esc(m.unidade)}</span><span>${money(m.valor)}</span></li>`).join('')}</ul></article>`;
   return `<article class="crm-entry"><div class="crm-entry-head"><div><strong>${esc(i.nome_original)}</strong><small>${esc(data(i.finalizado_em||i.criado_em))} · ${i.estado==='arquivado'?'Arquivado':'Para conferir'} · ${Math.ceil(i.tamanho_bytes/1024)} KB</small></div><button type="button" class="crm-button" data-crm-pdf="${esc(i.id)}">Ver PDF</button></div></article>`;
  }).join('');
  if(d.total>20)html+=`<div class="crm-page-controls"><button type="button" class="crm-button" data-crm-page="${s}" data-pagina="${d.pagina-1}" ${d.pagina===0?'disabled':''}>Anterior</button><span>${d.pagina+1} / ${Math.ceil(d.total/20)}</span><button type="button" class="crm-button" data-crm-page="${s}" data-pagina="${d.pagina+1}" ${(d.pagina+1)*20>=d.total?'disabled':''}>Próxima</button></div>`;
  el.innerHTML=html;
 }
 async function carregarSecao(s,page=0){
  if(!ficha)return;const ticket=fichaTicket,seq=(secTickets.get(s)||0)+1;secTickets.set(s,seq);const el=$('crmFichaSecoes').querySelector(`[data-crm-lista="${s}"]`);el.innerHTML='<p class="crm-empty">Carregando…</p>';
  try{const d=await json(urlFicha(ficha.paciente.id)+'/'+s+'?pagina='+page);if(ticket!==fichaTicket||seq!==secTickets.get(s))return;secCache.set(s,d);renderSecao(s,d);}catch(e){if(ticket===fichaTicket&&seq===secTickets.get(s)){el.innerHTML=`<p class="crm-error">${esc(e.message)}</p><button type="button" class="crm-button" data-crm-page="${s}" data-pagina="${page}">Tentar novamente</button>`;}}
 }
 async function atualizarFicha(id){
  const ticket=fichaTicket;
  try{
   const dados=await json(urlFicha(id));
   if(ticket!==fichaTicket||!$('crmFicha').open)return;
   ficha=dados;
   $('crmFichaNome').textContent=dados.paciente.nome;
   $('crmFichaContato').textContent=[foneBonito(dados.paciente.telefone),statusPaciente(dados.paciente.status)].filter(Boolean).join(' · ');
   const link=whatsapp(dados.paciente.telefone);
   $('crmFichaWhatsapp').hidden=!link;
   if(link)$('crmFichaWhatsapp').href=link;else $('crmFichaWhatsapp').removeAttribute('href');
   $('crmFichaProximo').textContent=dados.proximo?data(dados.proximo.data):'Sem agendamento';
   $('crmFichaRecebido').textContent=money(dados.recebido);
   for(const el of $('crmFichaSecoes').querySelectorAll('[data-crm-contagem]'))el.textContent=dados.contagens[el.dataset.crmContagem]??'';
   const secao=$('crmFichaSecoes').querySelector('details[open]')?.dataset.crmSecao;
   const pagina=secCache.get(secao)?.pagina??0;
   secCache.clear();
   if(secao){
    const dadosSecao=await json(urlFicha(id)+'/'+secao+'?pagina='+pagina);
    if(ticket!==fichaTicket||!$('crmFicha').open)return;
    secCache.set(secao,dadosSecao);
    renderSecao(secao,dadosSecao);
   }
  }catch{/* A ficha permanece disponível se a atualização falhar. */}
 }
 function abrirPDF(arquivoId=null){
  if(!ficha?.permissoes.documentos||!window.KahennaDocumentos)return;
  const {id,nome}=ficha.paciente;
  window.KahennaDocumentos.abrir(id,nome,arquivoId,()=>atualizarFicha(id));
 }
 function abrirAcaoLocal(tipo,p){
  if(location.pathname==='/leads.html'){
   if(tipo==='financeiro')return window.KahennaPacientes?.financeiro(p);
   if(tipo==='editar')return window.KahennaPacientes?.editar(p);
   if(tipo==='lembrete')return window.abrirLembretePaciente?.(p);
  }
 }
 function acao(tipo){
  if(!ficha)return;
  const id=ficha.paciente.id;
  if(tipo==='documentos')return abrirPDF();
  const destinos={
   agendar:['agenda.html','modalAgendamento',{novo:'1'}],
   retorno:['agenda.html','modalAgendamento',{novo:'1',retorno:'1'}],
   materiais:['estoque.html','atendimentoDialog',{novo_atendimento:'1'}],
   financeiro:['leads.html','modalEdicaoOverlay',{acao:'financeiro'}],
   editar:['leads.html','modalIdentificacaoOverlay',{acao:'editar'}],
   lembrete:['leads.html','reminderDialog',{acao:'lembrete'}]
  };
  if(!Object.hasOwn(destinos,tipo))return;
  const [pagina,alvo,parametros]=destinos[tipo];
  abrirJanelaAcao('/'+pagina+'?'+new URLSearchParams({paciente:id,...parametros}),alvo,id,tipo);
 }
 function abrirJanelaAcao(url,alvo,id,tipo){
  const janela=$('crmJanelaAcao'),quadro=$('crmAcaoQuadro'),estado=$('crmAcaoEstado');
  if(janela.open)return;
  const foco=document.activeElement;
  let observador,timer,abriu=false;
  estado.hidden=false;
  estado.querySelector('p').textContent='Carregando…';
  quadro.hidden=true;
  janela.addEventListener('close',()=>{
   clearTimeout(timer);
   observador?.disconnect();
   quadro.onload=null;
   quadro.src='about:blank';
   janela.oncancel=null;
   foco?.focus({preventScroll:true});
   if(!abriu)return;
   atualizarFicha(id);
   if(tipo==='agendar'||tipo==='retorno')$('atualizarAgenda')?.click();
   if(tipo==='materiais')$('atualizarEstoque')?.click();
   if(tipo==='editar'||tipo==='financeiro')$('btnAtualizar')?.click();
  },{once:true});
  janela.oncancel=e=>{if(abriu)e.preventDefault();};
  janela.showModal();
  timer=setTimeout(()=>{estado.querySelector('p').textContent='Não foi possível abrir esta ação. Feche e tente novamente.';},15000);
  quadro.onload=()=>{
   const doc=quadro.contentDocument,modal=doc?.getElementById(alvo);
   if(!modal)return;
   const css=doc.createElement('style');
   css.textContent=`
    html,body { background:transparent !important; overflow:hidden !important; }
    body { visibility:hidden; }
    #${alvo},#${alvo} * { visibility:visible; }
   `;
   doc.head.append(css);
   const acompanhar=()=>{
    const aberto=modal.tagName==='DIALOG'?modal.open:alvo==='modalAgendamento'?!modal.hidden:modal.classList.contains('open');
    if(!aberto){if(abriu)janela.close();return;}
    if(abriu)return;
    abriu=true;
    clearTimeout(timer);
    quadro.hidden=false;
    estado.hidden=true;
    const primeiro=modal.querySelector('input:not([type=hidden]):not([disabled]), button:not([disabled]), select:not([disabled])');
    primeiro?.focus({preventScroll:true});
   };
   observador=new MutationObserver(acompanhar);
   observador.observe(modal,{attributes:true,attributeFilter:['class','hidden','open']});
   acompanhar();
  };
  quadro.src=url;
 }
 function renderBusca(){
  $('crmBuscaResultados').innerHTML=Object.entries(rotulos).map(([tipo,nome])=>{
   const rows=buscaGrupos[tipo]||[];if(!rows.length)return '';return `<section><h3>${nome}</h3>${rows.map(i=>{
    let titulo=i.nome,info='',destino='paciente',id=i.id,secao='';
    if(tipo==='pacientes')info=foneBonito(i.telefone);
    if(tipo==='agenda'){info=data(i.data_avaliacao)+' · '+(estados[i.status]||i.status);id=i.paciente_id;secao='atendimentos';}
    if(tipo==='produtos'){info=i.categoria+' · '+qtd(i.quantidade)+' '+i.unidade;destino='estoque';id=i.nome;}
    if(tipo==='lotes'){titulo=(i.codigo||'Lote')+' · '+i.nome;info=(i.validade?'Validade: '+dia(i.validade):'Sem validade')+' · '+qtd(i.quantidade_restante)+' '+i.unidade;destino='estoque';id=i.nome;}
    if(tipo==='documentos'){titulo=i.nome_original;info=i.nome;id=i.paciente_id;secao='documentos';}
    return `<button type="button" class="crm-search-result" data-crm-destino="${destino}" data-crm-id="${esc(id)}" data-crm-secao-destino="${secao}"${tipo==='documentos'?` data-crm-arquivo="${esc(i.id)}"`:''}><strong>${esc(titulo)}</strong><small>${esc(info)}</small></button>`;
   }).join('')}</section>`;
  }).join('');
 }
 async function buscar(append=false){
  if(append&&buscaOcupada)return;const termo=$('crmBuscaTermo').value.trim(),ticket=++buscaTicket;
  if(termo.length<2){buscaGrupos={};$('crmBuscaResultados').replaceChildren();$('crmBuscaEstado').textContent='';$('crmBuscaMais').hidden=true;return;}
  const page=append?buscaPagina+1:0;if(!append){buscaGrupos={};$('crmBuscaResultados').replaceChildren();}buscaOcupada=true;$('crmBuscaMais').disabled=true;$('crmBuscaEstado').textContent='Buscando…';
  try{const d=await json('/api/clinica/busca',{method:'POST',body:JSON.stringify({q:termo,pagina:page})});if(ticket!==buscaTicket||!$('crmBusca').open)return;buscaPagina=page;for(const tipo of Object.keys(rotulos)){const mapa=new Map((buscaGrupos[tipo]||[]).map(i=>[String(i.id),i]));for(const item of d.grupos[tipo]||[])mapa.set(String(item.id),item);buscaGrupos[tipo]=[...mapa.values()];}buscaMais=Object.values(d.mais).some(Boolean);renderBusca();$('crmBuscaEstado').textContent=Object.values(buscaGrupos).some(r=>r.length)?'':'Nenhum resultado';$('crmBuscaMais').hidden=!buscaMais;}
  catch(e){if(ticket===buscaTicket)$('crmBuscaEstado').textContent=e.message;}finally{if(ticket===buscaTicket){buscaOcupada=false;$('crmBuscaMais').disabled=false;}}
 }
 function abrirBusca(){buscaFoco=document.activeElement;clearTimeout(buscaTimer);++buscaTicket;buscaPagina=0;buscaGrupos={};buscaOcupada=false;$('crmBuscaTermo').value='';$('crmBuscaEstado').textContent='';$('crmBuscaResultados').replaceChildren();$('crmBuscaMais').hidden=true;$('crmBusca').showModal();$('crmBuscaTermo').focus();}
 function limparAviso(context){avisos.delete(context);revisoes.set(context,(revisoes.get(context)||0)+1);document.getElementById(context)?.querySelector('.crm-duplicate')?.remove();}
 async function enviarCadastro(url,body,method,context,botao){
  const assinatura=JSON.stringify({url,body}),ok=avisos.get(context),dados={...body};if(ok?.assinatura===assinatura)dados.confirmacao_duplicado=ok.confirmacao;
  const revision=(revisoes.get(context)||0)+1;revisoes.set(context,revision);
  const r=await fetch(url,{method,cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(dados)});
  if(r.status===401){location.replace('/login.html');return r;}
  if(r.status===409){const d=await r.clone().json().catch(()=>null);if(d?.codigo==='POSSIVEL_DUPLICADO'&&revisoes.get(context)===revision&&$(context)?.classList.contains('open')){
   const overlay=$(context),box=document.createElement('section');box.className='crm-duplicate';box.setAttribute('aria-label','Possível cadastro duplicado');box.innerHTML=`<h3>Possível cadastro duplicado</h3><ul class="crm-duplicate-list">${d.duplicados.map(p=>`<li><strong>${esc(p.nome)}</strong><small>${esc(p.telefone)} · ${p.motivos.map(esc).join(' · ')}</small><button type="button" class="crm-button" data-crm-duplicado="${esc(p.visitante_id)}">Abrir cadastro</button></li>`).join('')}</ul>${d.total>d.duplicados.length?`<small>${d.total} cadastros semelhantes</small>`:''}<div class="crm-duplicate-actions"><button type="button" class="crm-button" data-crm-continuar>${method==='POST'?'Cadastrar':'Salvar'} mesmo assim</button></div>`;
   overlay.querySelector('.crm-duplicate')?.remove();(overlay.querySelector('.modal-edicao-body')||overlay).append(box);
   box.querySelector('[data-crm-continuar]').addEventListener('click',()=>{avisos.set(context,{assinatura,confirmacao:d.confirmacao});$(botao)?.click();});
   box.querySelectorAll('[data-crm-duplicado]').forEach(b=>b.addEventListener('click',()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('modal-edicao-aberto');limparAviso(context);abrir(b.dataset.crmDuplicado);}));
   box.querySelector('button')?.focus();r.crmAvisoExibido=true;
  }}else if(r.ok)limparAviso(context);return r;
 }
 window.CrmPaciente={abrir,abrirBusca,enviarCadastro,limparAviso};
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.createElement('button');button.type='button';button.className='crm-global-search';button.setAttribute('aria-label','Busca geral');button.title='Busca geral';button.innerHTML='<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Buscar</span>';document.querySelector('.sidebar-main .menu')?.before(button);button.addEventListener('click',abrirBusca);
  $('crmAcaoVoltar').addEventListener('click',()=>$('crmJanelaAcao').close());
  const menu=document.querySelector('.sidebar-main .menu');
  menu?.addEventListener('click',event=>{
   const link=event.target.closest('a[href]');
   if(!link||link.getAttribute('aria-current')==='page'||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.defaultPrevented)return;
   menu.querySelector('[data-navegando]')?.removeAttribute('data-navegando');
   link.setAttribute('data-navegando','');
  });
  window.addEventListener('pageshow',()=>menu?.querySelector('[data-navegando]')?.removeAttribute('data-navegando'));
  for(const dialog of [$('crmFicha'),$('crmBusca')])dialog.querySelector('[data-crm-fechar]').addEventListener('click',()=>dialog.close());
  $('crmFicha').addEventListener('close',()=>{++fichaTicket;ficha=null;secCache.clear();fichaFoco?.focus();});$('crmBusca').addEventListener('close',()=>{clearTimeout(buscaTimer);++buscaTicket;buscaOcupada=false;buscaFoco?.focus();});
  $('crmFichaSecoes').querySelectorAll('details').forEach(det=>det.addEventListener('toggle',()=>{if(!det.open||!ficha)return;for(const outro of $('crmFichaSecoes').querySelectorAll('details'))if(outro!==det)outro.open=false;const s=det.dataset.crmSecao;if(!secCache.has(s))carregarSecao(s);}));
  $('crmFicha').addEventListener('click',e=>{const ac=e.target.closest('[data-crm-acao]');if(ac)return acao(ac.dataset.crmAcao);const p=e.target.closest('[data-crm-page]');if(p)return carregarSecao(p.dataset.crmPage,Number(p.dataset.pagina));const pdf=e.target.closest('[data-crm-pdf]');if(pdf)abrirPDF(pdf.dataset.crmPdf);});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-ver-paciente]');if(b){e.preventDefault();e.stopPropagation();abrir(b.dataset.verPaciente,b.dataset.fichaSecao||null);}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('crmBusca').open&&!$('crmFicha').open)abrirBusca();}});
  $('crmBuscaTermo').addEventListener('input',()=>{clearTimeout(buscaTimer);++buscaTicket;$('crmBuscaResultados').replaceChildren();$('crmBuscaMais').hidden=true;buscaTimer=setTimeout(()=>buscar(),350);});$('crmBuscaMais').addEventListener('click',()=>buscar(true));
  $('crmBuscaResultados').addEventListener('click',e=>{const b=e.target.closest('[data-crm-destino]');if(!b)return;if(b.dataset.crmDestino==='estoque'){location.href='/estoque.html?'+new URLSearchParams({buscar:b.dataset.crmId});return;}const {crmId,crmSecaoDestino,crmArquivo}=b.dataset;$('crmBusca').close();abrir(crmId,crmSecaoDestino).then(()=>{if(crmArquivo&&ficha?.paciente.id===crmId)abrirPDF(crmArquivo);});});
  for(const context of ['modalNovoPacienteOverlay','modalIdentificacaoOverlay','modalEdicaoOverlay'])$(context)?.addEventListener('input',()=>limparAviso(context));
  const params=new URLSearchParams(location.search),p=params.get('paciente'),acaoInicial=params.get('acao');
  if(location.pathname==='/leads.html'&&p){abrir(p).then(()=>{if(ficha&&['financeiro','editar','lembrete'].includes(acaoInicial)){const paciente=perfilLead();$('crmFicha').close();abrirAcaoLocal(acaoInicial,paciente);}});}
 });
})();
