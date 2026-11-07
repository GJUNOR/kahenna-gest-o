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

 const weekStart=new Date(day.getTime()-((day.getUTCDay()+6)%7)*86400000);
 const end=new Date(weekStart.getTime()+7*86400000);
 const params=new URLSearchParams({inicio:weekStart.toISOString(),fim:end.toISOString()});
 const [patients,bookings]=await Promise.allSettled([ler('/api/leads'),ler('/api/agendamentos?'+params)]);
 if(patients.status==='rejected'){document.getElementById('aniversariosEstado').textContent='Não foi possível consultar os aniversários. Tente atualizar.';document.getElementById('aniversariosLista').replaceChildren();document.getElementById('aniversariosContagem').textContent='—';throw patients.reason;}
 const ps=dados(patients.value);renderizarAniversarios(ps);
 if(bookings.status==='rejected')throw bookings.reason;const bs=dados(bookings.value);
 const today=bs.filter(x=>new Date(x.data_avaliacao)>=day&&new Date(x.data_avaliacao)<new Date(day.getTime()+86400000)&&x.status!=='cancelado');
 document.getElementById('agendamentosHoje').textContent=today.length;
 const render=(item)=>`<div class="summary-appointment${item.atendido_em?' is-attended':''}"><time>${escapar(new Date(item.data_avaliacao).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}))}</time><div><strong>${escapar(item.paciente?.nome||ps.find(p=>p.visitante_id===item.visitante_id)?.nome||'Paciente')}</strong><span class="today-confirmation">${item.atendido_em?'Atendido':item.confirmado_em?'Paciente confirmado':'Aguardando confirmação'}</span>${item.atendido_em?(item.retorno_agendado_id?`<small class="today-return-saved">Retorno agendado</small>`:`<button type="button" class="today-return" data-retorno="${escapar(item.visitante_id)}" data-origem="${escapar(item.id)}"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i><span>Retorno</span></button>`):""}</div><button type="button" class="attendance-toggle" data-attended="${escapar(item.id)}" data-paciente="${escapar(item.visitante_id)}" aria-pressed="${Boolean(item.atendido_em)}" aria-label="${item.atendido_em?'Desmarcar atendimento':'Marcar como atendido'}" title="${item.atendido_em?'Desmarcar atendimento':'Marcar como atendido'}"><i class="fa-solid fa-check" aria-hidden="true"></i></button></div>`;
 document.getElementById('agendaResumo').innerHTML=today.length?today.map(render).join(''):'<p class="empty-state">Nenhum horário agendado para hoje.</p>';
 const weekItems=bs.filter(item=>item.status!=='cancelado');
 const days=Array.from({length:7},(_,i)=>new Date(weekStart.getTime()+i*86400000));
 document.getElementById('agendaSemana').innerHTML=days.map(date=>{
  const next=new Date(date.getTime()+86400000);
  const items=weekItems.filter(item=>new Date(item.data_avaliacao)>=date&&new Date(item.data_avaliacao)<next);
  const label=date.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit'});
  return `<section class="week-patients-day"><h3>${escapar(label)}</h3>${items.length?`<ul>${items.map(item=>`<li>${escapar(item.paciente?.nome||ps.find(p=>p.visitante_id===item.visitante_id)?.nome||'Paciente')}</li>`).join('')}</ul>`:'<p>Sem pacientes</p>'}</section>`;
 }).join('');
 document.getElementById('semanaContagem').textContent=weekItems.length+' agendamento'+(weekItems.length===1?'':'s');
}catch(e){error.textContent=e.message;error.hidden=false;document.getElementById('agendaResumo').innerHTML=document.getElementById('agendaSemana').innerHTML='<p class="empty-state">Os dados não foram carregados.</p>';}finally{btn.disabled=false;}}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('btnAtualizar').addEventListener('click',resumo);resumo();});

document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('agendaResumo').addEventListener('click',async event=>{
  const retorno=event.target.closest('[data-retorno]');
  if(retorno){
   if(retorno.disabled)return;
   retorno.disabled=true;
   try{await carregarPacientes();abrirModal(undefined,null,retorno.dataset.retorno,true,retorno.dataset.origem);}
   finally{retorno.disabled=false;}
   return;
  }
  const button=event.target.closest('[data-attended]');
  if(!button||button.disabled)return;
  const desired=button.getAttribute('aria-pressed')!=='true';
  const error=document.getElementById('erroResumo');
  button.disabled=true;
  error.hidden=true;
  try{
   const response=await fetch('/api/agendamentos/'+encodeURIComponent(button.dataset.attended)+'/acompanhamento',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({atendido:desired})});
   if(response.status===401){location.replace('/login.html');return;}
   const result=await response.json();
   if(!response.ok)throw new Error(result.mensagem||'Não foi possível atualizar o atendimento.');
   await resumo();
  }catch(e){error.textContent=e.message;error.hidden=false;}
  finally{button.disabled=false;}
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
