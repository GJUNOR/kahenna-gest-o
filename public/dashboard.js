'use strict';
const escapar=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dados=(r)=>Array.isArray(r)?r:(r.data||r.dados||[]);
async function ler(url){const r=await fetch(url,{cache:'no-store'});if(r.status===401){location.replace('/login.html');throw new Error('Entre novamente.')}if(!r.ok)throw new Error('Não foi possível carregar os dados.');return r.json();}
async function carregarReceitaRotina(){
 const hoje=document.getElementById('receitaHoje'),mes=document.getElementById('receitaMes');
 try{const r=await ler('/api/conversoes/resumo');const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});hoje.textContent=moeda(r.receitaHoje??r.receita_hoje);mes.textContent=moeda(r.receitaMes??r.receita_mes);hoje.removeAttribute('title');mes.removeAttribute('title');}
 catch(e){hoje.textContent='—';mes.textContent='—';hoje.title=mes.title='Não foi possível carregar a receita. Clique em Atualizar para tentar novamente.';}
}
async function resumo(){carregarReceitaRotina();const btn=document.getElementById('btnAtualizar');btn.disabled=true;const error=document.getElementById('erroResumo');error.hidden=true;try{
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>dateParts.find(p=>p.type===t).value;
 const day=new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00-03:00`);
 const tomorrow=new Date(day.getTime()+86400000);
 const end=new Date(day.getTime()+2*86400000);
 const params=new URLSearchParams({inicio:day.toISOString(),fim:end.toISOString()});
 const [patients,bookings]=await Promise.allSettled([ler('/api/leads'),ler('/api/agendamentos?'+params)]);
 if(patients.status==='rejected'){document.getElementById('aniversariosEstado').textContent='Não foi possível consultar os aniversários. Tente atualizar.';document.getElementById('aniversariosLista').replaceChildren();document.getElementById('aniversariosContagem').textContent='—';throw patients.reason;}
 const ps=dados(patients.value);renderizarAniversarios(ps);
 if(bookings.status==='rejected')throw bookings.reason;const bs=dados(bookings.value);
 const today=bs.filter(x=>new Date(x.data_avaliacao)>=day&&new Date(x.data_avaliacao)<new Date(day.getTime()+86400000)&&x.status!=='cancelado');
 document.getElementById('agendamentosHoje').textContent=today.length;
 const tomorrowItems=bs.filter(x=>new Date(x.data_avaliacao)>=tomorrow&&new Date(x.data_avaliacao)<end&&x.status!=='cancelado');
 const render=(item,isTomorrow)=>`<div class="summary-appointment"><time>${escapar(new Date(item.data_avaliacao).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}))}</time><div><strong>${escapar(item.paciente?.nome||ps.find(p=>p.visitante_id===item.visitante_id)?.nome||'Paciente')}</strong>${item.observacao&& !/^(atendimento|paciente) agendado$/i.test(item.observacao.trim())?`<small>${escapar(item.observacao)}</small>`:''}${isTomorrow?`<div class="appointment-followup" data-appointment="${escapar(item.id)}">${followupButton(item,'lembrete_enviado_em','Lembrete enviado')}${followupButton(item,'confirmado_em','Paciente confirmado')}</div>`:`<span class="today-confirmation${item.confirmado_em?' is-confirmed':''}">${item.confirmado_em?'✓ Paciente confirmado':'Aguardando confirmação'}</span>`}</div></div>`;
 document.getElementById('agendaResumo').innerHTML=today.length?today.map(x=>render(x,false)).join(''):'<p class="empty-state">Nenhum horário agendado para hoje.</p>';
 document.getElementById('agendaAmanha').innerHTML=tomorrowItems.length?tomorrowItems.map(x=>render(x,true)).join(''):'<p class="empty-state">Nenhum horário agendado para amanhã.</p>';
 document.getElementById('amanhaContagem').textContent=tomorrowItems.length+' atendimento'+(tomorrowItems.length===1?'':'s');

}catch(e){error.textContent=e.message;error.hidden=false;document.getElementById('agendaResumo').innerHTML=document.getElementById('agendaAmanha').innerHTML='<p class="empty-state">Os dados não foram carregados.</p>';}finally{btn.disabled=false;}}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('btnAtualizar').addEventListener('click',resumo);resumo();});

function followupButton(item,field,label){const marked=Boolean(item[field]);return `<button type="button" class="followup-toggle${marked?' is-marked':''}" data-followup="${field}" aria-pressed="${marked}" title="Marcação manual: ${label.toLowerCase()}"><span class="followup-check" aria-hidden="true">${marked?'✓':''}</span>${label}</button>`;}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('agendaAmanha').addEventListener('click',async event=>{
  const button=event.target.closest('[data-followup]');if(!button||button.disabled)return;
  const group=button.closest('[data-appointment]');const field=button.dataset.followup;
  const previous=button.getAttribute('aria-pressed')==='true';
  const desired=!previous;
  const apply=(target,marked)=>{target.setAttribute('aria-pressed',String(marked));target.classList.toggle('is-marked',marked);target.querySelector('.followup-check').textContent=marked?'✓':'';};
  apply(button,desired);
  group.setAttribute('aria-busy','true');
  const all=[...group.querySelectorAll('button')];all.forEach(b=>b.disabled=true);
  const error=document.getElementById('erroAmanha');error.hidden=true;
  try{
   const payload=field==='lembrete_enviado_em'?{lembrete_enviado:desired}:{paciente_confirmado:desired};
   const response=await fetch('/api/agendamentos/'+encodeURIComponent(group.dataset.appointment)+'/acompanhamento',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(response.status===401){location.replace('/login.html');return;}
   const result=await response.json();if(!response.ok)throw new Error(result.mensagem||'Não foi possível salvar a marcação.');
   const item=result.data;group.querySelectorAll('[data-followup]').forEach(target=>apply(target,Boolean(item[target.dataset.followup])));
  }catch(e){apply(button,previous);error.textContent=e.message;error.hidden=false;}
  finally{group.removeAttribute('aria-busy');group.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
});

function renderizarAniversarios(pacientes) {
 const itens=window.KahennaAniversarios.aniversariantesHoje(pacientes);
 const card=document.getElementById('aniversariosCard');
 const lista=document.getElementById('aniversariosLista');lista.replaceChildren();
 document.getElementById('aniversariosContagem').textContent=String(itens.length);
 const estado=document.getElementById('aniversariosEstado');
 estado.textContent=itens.length?'':'Nenhum aniversário cadastrado para hoje.';estado.hidden=Boolean(itens.length);
 if(!card.dataset.carregado){card.open=Boolean(itens.length);card.dataset.carregado='true';}
 for(const paciente of itens){
  const item=document.createElement('li');const nome=document.createElement('span');nome.textContent=paciente.nome||'Paciente';item.append(nome);
  const url=window.KahennaAniversarios.linkParabens(paciente);
  if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Dar parabéns';link.title='Revisar a mensagem no WhatsApp antes de enviar';link.setAttribute('aria-label',`Preparar parabéns para ${paciente.nome||'paciente'} no WhatsApp`);item.append(link);}
  else{const aviso=document.createElement('small');aviso.textContent='Confira o telefone no cadastro';item.append(aviso);}
  lista.append(item);
 }
}
