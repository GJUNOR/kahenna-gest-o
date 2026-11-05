'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(v,n=2)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:n});
 const qtd=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
 let produtos=new Map(),disponiveis=new Map(),selecionados=new Map(),busy=false,carregando=false,carregandoLista=false,erroLista=false;
 let op,pagina=0,sessao=0,listaTicket=0,reportTicket=0,foco,pacienteAnterior='';
 async function api(url,body,method='POST'){
  const r=await fetch('/api/estoque'+url,{cache:'no-store',method:body?method:'GET',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===401){location.replace('/login.html');throw Error('Sua sessão expirou.');}
  const d=await r.json();if(!r.ok)throw Error(d.mensagem||'Não foi possível concluir.');return d;
 }
 const erro=e=>{$('atendimentoErro').textContent=e.message||e;$('atendimentoErro').hidden=false;};
 const valido=p=>p?.ativo&&['un','ml','g'].includes(p.unidade)&&Number(p.quantidade)>0;
 function total(){
  let soma=0;
  for(const [id,item] of selecionados){const p=produtos.get(id),q=Number(item.quantidade);if(q>0&&Number.isFinite(q))soma+=q*Number(p?.custo_medio||0);}
  $('atendimentoTotal').textContent=money(soma);
  $('atendimentoSelecionados').textContent=selecionados.size+' selecionado'+(selecionados.size===1?'':'s');
 }
 function desenhar(){
  const rows=[...produtos.values()].filter(p=>p.ativo&&Number(p.quantidade)>0||selecionados.has(p.id)).sort((a,b)=>(a.prioridade??1)-(b.prioridade??1)||a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id));
  $('atendimentoItens').innerHTML=rows.length?rows.map(p=>{
   const item=selecionados.get(p.id),ok=valido(p),valor=item?Number(item.quantidade)*Number(p.custo_medio):0;
   return `<div class="stock-pick-row${item?' is-selected':''}"><label class="stock-product-choice"><input type="checkbox" data-selecionar="${esc(p.id)}" ${item?'checked':''} ${!ok&&!item?'disabled':''}><span><strong>${esc(p.nome)}</strong><small>${ok?'Saldo: '+qtd(p.quantidade)+' '+esc(p.unidade):!p.ativo?'Produto excluído':Number(p.quantidade)<=0?'Sem estoque':'Unidade de uso pendente'}</small></span></label><label class="stock-pick-quantity">Quantidade<input type="number" data-quantidade="${esc(p.id)}" aria-label="Quantidade de ${esc(p.nome)} (${esc(p.unidade)})" min="0.001" max="${Math.min(999999.999,Number(p.quantidade)||999999.999)}" step="0.001" ${item&&ok?'required':'disabled'} value="${item?esc(item.quantidade):''}"></label><strong class="stock-pick-cost" data-custo="${esc(p.id)}">${item&&Number.isFinite(valor)?money(valor):'—'}</strong></div>`;
  }).join(''):'<p class="stock-selection-empty">Nenhum produto com saldo</p>';
  $('atendimentoItens').setAttribute('aria-busy','false');total();
 }
 async function todasPaginas(endpoint,chave,ticket){
  const rows=new Map();let page=0;
  do{
   const r=await api(endpoint+(endpoint.includes('?')?'&':'?')+'pagina='+page);
   if(ticket!==sessao)return null;
   const anterior=rows.size;for(const item of r[chave]||[])rows.set(item.id||item.visitante_id,item);
   if(!r.mais)return [...rows.values()];
   if(!r[chave]?.length||rows.size===anterior)throw Error('Não foi possível carregar a lista completa. Atualize a página e reabra o atendimento.');
   page++;
  }while(true);
 }
 async function abrir(pacienteId=null){
  if(typeof pacienteId!=='string')pacienteId=null;
  foco=document.activeElement;op=crypto.randomUUID();const ticket=++sessao;++listaTicket;
  busy=false;carregando=true;carregandoLista=false;erroLista=false;pacienteAnterior='';produtos.clear();disponiveis.clear();selecionados.clear();
  $('atendimentoForm').reset();$('atendimentoOpcoesLista').open=false;$('atendimentoErro').hidden=true;
  $('atendimentoPaciente').innerHTML='<option value="">Carregando…</option>';$('atendimentoPaciente').disabled=true;
  $('atendimentoData').value=window.KahennaAniversarios.hojeBrasil();$('atendimentoData').max=$('atendimentoData').value;
  $('atendimentoItens').innerHTML='<p class="stock-selection-empty">Carregando produtos…</p>';$('atendimentoItens').setAttribute('aria-busy','true');total();
  $('atendimentoDialog').showModal();
  try{
   const [ps,stock]=await Promise.all([todasPaginas('/pacientes','pacientes',ticket),todasPaginas('/catalogo?disponiveis=true','produtos',ticket)]);
   if(ticket!==sessao)return;
   $('atendimentoPaciente').innerHTML='<option value="">'+(ps.length?'Selecione':'Nenhum paciente cadastrado')+'</option>'+ps.map(p=>`<option value="${esc(p.visitante_id)}">${esc(p.nome)}</option>`).join('');
   for(const p of stock)disponiveis.set(p.id,{...p,ativo:true});produtos=new Map(disponiveis);desenhar();if(pacienteId&&ps.some(p=>p.visitante_id===pacienteId)){$('atendimentoPaciente').value=pacienteId;await lista();}
  }catch(e){if(ticket===sessao){erro(e);$('atendimentoItens').innerHTML='<p class="stock-selection-empty">Não foi possível carregar os produtos</p>';}}
  finally{if(ticket===sessao){carregando=false;$('atendimentoPaciente').disabled=false;$('atendimentoItens').setAttribute('aria-busy','false');}}
 }
 async function lista(){
  const ticket=++listaTicket,session=sessao,p=$('atendimentoPaciente').value;
  const anteriores=new Map(!pacienteAnterior&&p?selecionados:[]);pacienteAnterior=p;
  selecionados.clear();produtos=new Map(disponiveis);erroLista=false;$('atendimentoErro').hidden=true;desenhar();
  if(!p){carregandoLista=false;return;}carregandoLista=true;$('atendimentoItens').setAttribute('aria-busy','true');
  try{
   const r=await api('/pacientes/'+p+'/lista');if(ticket!==listaTicket||session!==sessao)return;
   for(const produto of r.produtos)produtos.set(produto.id,produto);
   for(const item of r.itens){if(!produtos.has(item.produto_id))produtos.set(item.produto_id,{id:item.produto_id,nome:'Produto indisponível',unidade:item.unidade||'un',quantidade:0,ativo:false});selecionados.set(item.produto_id,{quantidade:item.quantidade});}
   for(const [id,item] of anteriores)if(produtos.has(id))selecionados.set(id,item);
   desenhar();
  }catch(e){if(ticket===listaTicket&&session===sessao){erroLista=true;erro(e);}}
  finally{if(ticket===listaTicket&&session===sessao){carregandoLista=false;$('atendimentoItens').setAttribute('aria-busy','false');}}
 }
 function payload(){
  if(!$('atendimentoPaciente').value)throw Error('Selecione o paciente.');
  if(erroLista)throw Error('Não foi possível carregar a lista padrão. Selecione o paciente novamente.');
  return [...selecionados].map(([id,item])=>{const p=produtos.get(id);if(!valido(p))throw Error('Desmarque os produtos indisponíveis antes de confirmar.');return {produto_id:id,quantidade:item.quantidade,revisao:p.revisao,lote_id:null};});
 }
 async function salvar(soLista){
  if(busy)return;if(carregando||carregandoLista)return erro('Aguarde carregar os produtos e a lista do paciente.');
  $('atendimentoErro').hidden=true;let linhas;try{linhas=payload();if(!soLista&&!linhas.length)throw Error('Selecione os produtos utilizados.');}catch(e){return erro(e);}
  if(!$('atendimentoForm').reportValidity())return;
  busy=true;const controles=[...$('atendimentoDialog').querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controles.forEach(([el])=>el.disabled=true);
  try{
   if(soLista){await api('/pacientes/'+$('atendimentoPaciente').value+'/lista',{itens:linhas},'PUT');$('atendimentoDialog').close();$('stockFeedback').textContent='Lista padrão salva. O estoque permanece com o mesmo saldo.';}
   else{const r=await api('/atendimentos',{id:op,paciente_id:$('atendimentoPaciente').value,descricao:$('atendimentoDescricao').value,ocorrido_em:$('atendimentoData').value,itens:linhas,salvar_padrao:$('atendimentoSalvarPadrao').checked});$('atendimentoDialog').close();$('stockFeedback').textContent='Baixa confirmada. Custo dos materiais: '+money(r.atendimento.custo_total);$('atualizarEstoque').click();}
   $('stockFeedback').hidden=false;$('stockFeedback').classList.remove('error');document.dispatchEvent(new Event('stock-updated'));
  }catch(e){erro(e);}finally{busy=false;controles.forEach(([el,v])=>el.disabled=v);}
 }
 async function relatorio(){const ticket=++reportTicket;try{const r=await api('/atendimentos?'+new URLSearchParams({mes:$('mesEstoque').value,pagina}));if(ticket!==reportTicket)return;$('listaAtendimentos').innerHTML=r.atendimentos.length?r.atendimentos.map(a=>`<details class="stock-attendance"><summary><span><strong>${esc(a.paciente?.nome||'Paciente')}</strong><small>${esc(String(a.ocorrido_em).slice(0,10).split('-').reverse().join('/'))} · ${esc(a.descricao)}</small></span><strong>${money(a.custo_total)}</strong></summary><div>${a.itens.map(i=>`<div class="stock-attendance-item"><span>${esc(i.produto?.nome)} · ${qtd(i.quantidade)} ${esc(i.unidade_registro)} × ${money(i.custo_unitario,8)}</span><strong>${money(i.valor_total)}</strong></div>`).join('')}</div></details>`).join(''):'<div class="stock-empty"><strong>Nenhum atendimento registrado</strong></div>';$('paginarAtendimentos').hidden=r.total<=15;$('atendimentosAnterior').disabled=pagina===0;$('atendimentosProximo').disabled=(pagina+1)*15>=r.total;$('paginaAtendimentos').textContent='Página '+(pagina+1);}catch(e){if(ticket===reportTicket)$('listaAtendimentos').textContent=e.message;}}
 document.addEventListener('DOMContentLoaded',()=>{
  window.KahennaAtendimento={abrir:id=>abrir(id)};
  const parametros=new URLSearchParams(location.search);if(parametros.get('novo_atendimento')==='1')queueMicrotask(()=>abrir(parametros.get('paciente')));
  $('novoAtendimento').addEventListener('click',abrir);$('atendimentoPaciente').addEventListener('change',lista);
  $('atendimentoDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('atendimentoDialog').addEventListener('close',()=>{++sessao;++listaTicket;foco?.focus();});
  $('atendimentoDialog').querySelectorAll('[data-fechar]').forEach(b=>b.addEventListener('click',e=>{if(busy)e.stopImmediatePropagation();},true));
  $('atendimentoItens').addEventListener('change',e=>{
   const id=e.target.dataset.selecionar;if(!id)return;
   if(carregando||carregandoLista||busy){e.target.checked=selecionados.has(id);return;}
   if(e.target.checked){if(selecionados.size>=30){e.target.checked=false;return erro('Limite de 30 materiais.');}selecionados.set(id,{quantidade:1});}else selecionados.delete(id);
   const row=e.target.closest('.stock-pick-row'),input=row.querySelector('[data-quantidade]');row.classList.toggle('is-selected',e.target.checked);input.disabled=!e.target.checked||!valido(produtos.get(id));input.required=e.target.checked;input.value=e.target.checked?selecionados.get(id).quantidade:'';row.querySelector('[data-custo]').textContent=e.target.checked?money(produtos.get(id)?.custo_medio):'—';total();
   if(!e.target.checked&&!valido(produtos.get(id)))desenhar();
  });
  $('atendimentoItens').addEventListener('input',e=>{const id=e.target.dataset.quantidade;if(!id||!selecionados.has(id))return;selecionados.get(id).quantidade=e.target.value;const q=Number(e.target.value);e.target.closest('.stock-pick-row').querySelector('[data-custo]').textContent=q>0?money(q*Number(produtos.get(id)?.custo_medio||0)):'—';total();});
  $('atendimentoForm').addEventListener('submit',e=>{e.preventDefault();salvar(false);});$('atendimentoSomenteLista').addEventListener('click',()=>salvar(true));
  document.addEventListener('stock-updated',()=>{pagina=0;relatorio();});$('mesEstoque').addEventListener('change',()=>{pagina=0;relatorio();});$('atualizarEstoque').addEventListener('click',relatorio);$('atendimentosAnterior').addEventListener('click',()=>{pagina=Math.max(0,pagina-1);relatorio();});$('atendimentosProximo').addEventListener('click',()=>{pagina++;relatorio();});queueMicrotask(relatorio);
 });
})();
