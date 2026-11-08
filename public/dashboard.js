'use strict';
const escapar=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dados=(r)=>Array.isArray(r)?r:(r.data||r.dados||[]);
const ehRetorno=item=>Boolean(item.retorno_de)||String(item.observacao||'').trim().toLowerCase()==='retorno';
let modoLista='semana',mesLista='',semanaDados=[],pacientesLista=[],inicioSemanaLista,listaConsulta=0,dadosMesAtual=[],chaveMesAtual='';
async function carregarListaPeriodo(){
 const ticket=++listaConsulta;
 const mensal=modoLista!=='semana';
 const lista=document.getElementById('agendaSemana');
 const erro=document.getElementById('erroSemana');
 document.getElementById('verPacientesSemana').setAttribute('aria-pressed',String(!mensal));
 document.getElementById('verPacientesMes').setAttribute('aria-pressed',String(modoLista==='mes'));
 document.getElementById('verPacientesRetornos').setAttribute('aria-pressed',String(modoLista==='retornos'));
 document.getElementById('navegacaoMesPacientes').hidden=!mensal;
 document.getElementById('tituloListaPacientes').textContent=modoLista==='retornos'?'Retornos do mês':mensal?'Pacientes do mês':'Pacientes desta semana';
 if(!inicioSemanaLista||!mesLista)return;
 lista.setAttribute('aria-busy','true');
 erro.hidden=true;
 try{
  let itens=semanaDados,inicio=inicioSemanaLista,totalDias=7;
  if(mensal){
   const [ano,mes]=mesLista.split('-').map(Number);
   inicio=new Date(`${mesLista}-01T00:00:00-03:00`);
   totalDias=new Date(Date.UTC(ano,mes,0)).getUTCDate();
   const fim=new Date(inicio.getTime()+totalDias*86400000);
   document.getElementById('mesPacientesTitulo').textContent=inicio.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',month:'long',year:'numeric'});
   const hoje=new Date(window.KahennaAniversarios.hojeBrasil()+'T00:00:00-03:00');
   if(inicio<hoje){inicio=hoje;totalDias=Math.max(0,Math.round((fim-inicio)/86400000));}
   lista.innerHTML='<p class="empty-state">Carregando pacientes…</p>';
   itens=totalDias?(mesLista===chaveMesAtual?dadosMesAtual:dados(await ler('/api/agendamentos?'+new URLSearchParams({inicio:inicio.toISOString(),fim:fim.toISOString()})))).filter(item=>item.status!=='cancelado'&&new Date(item.data_avaliacao)>=inicio&&new Date(item.data_avaliacao)<fim):[];
  }
  if(ticket!==listaConsulta)return;
  itens=itens.filter(i=>!i.atendido_em&&i.status!=='realizado'&&(modoLista==='retornos'?ehRetorno(i):!ehRetorno(i)));
  const dias=Array.from({length:totalDias},(_,i)=>new Date(inicio.getTime()+i*86400000));
  lista.innerHTML=dias.map(data=>{
   const fim=new Date(data.getTime()+86400000);
   const pacientes=itens.filter(item=>new Date(item.data_avaliacao)>=data&&new Date(item.data_avaliacao)<fim);
   if(mensal&&!pacientes.length)return '';
   const rotulo=data.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit'});
   return `<section class="week-patients-day"><h3>${escapar(rotulo)}</h3>${pacientes.length?`<ul>${pacientes.map(item=>`<li><button type="button" class="patient-period-name" data-ver-paciente="${escapar(item.visitante_id)}">${escapar(item.paciente?.nome||pacientesLista.find(p=>p.visitante_id===item.visitante_id)?.nome||'Paciente')}</button></li>`).join('')}</ul>`:'<p>Sem pacientes</p>'}</section>`;
  }).join('')||'<p class="empty-state">Nenhum paciente agendado neste mês.</p>';
  document.getElementById('semanaContagem').textContent=itens.length+' agendamento'+(itens.length===1?'':'s');
 }catch(e){
  if(ticket!==listaConsulta)return;
  erro.textContent=e.message;erro.hidden=false;
  lista.innerHTML='<p class="empty-state">Não foi possível carregar os pacientes.</p>';
  document.getElementById('semanaContagem').textContent='';
 }finally{if(ticket===listaConsulta)lista.removeAttribute('aria-busy');}
}
async function ler(url){const r=await fetch(url,{cache:'no-store'});if(r.status===401){location.replace('/login.html');throw new Error('Entre novamente.')}if(!r.ok)throw new Error('Não foi possível carregar os dados.');return r.json();}
async function carregarReceitaRotina(){
 const hoje=document.getElementById('receitaHoje'),mes=document.getElementById('receitaMes');
 try{const r=await ler('/api/conversoes/resumo');const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});hoje.textContent=moeda(r.receitaHoje??r.receita_hoje);mes.textContent=moeda(r.receitaMes??r.receita_mes);hoje.removeAttribute('title');mes.removeAttribute('title');}
 catch(e){hoje.textContent='—';mes.textContent='—';hoje.title=mes.title='Não foi possível carregar a receita. Clique em Atualizar para tentar novamente.';}
}
function renderizarHorariosInicio(){const el=document.getElementById('inicioHorarios');if(!el||!window.KahennaTurnosClinica)return;const hoje=new Date(window.KahennaAniversarios.hojeBrasil()+'T12:00:00-03:00'),fragmento=document.createDocumentFragment();for(let n=0;n<60;n++){const d=new Date(hoje.getTime()+n*86400000),dia=window.KahennaAniversarios.hojeBrasil(d),turno=window.KahennaTurnosClinica.obter(dia);if(!turno)continue;const span=document.createElement('span');span.textContent=d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit'}).replace('.','')+' · '+turno.inicio+'h–'+(turno.fim===24?'00':turno.fim)+'h';fragmento.append(span);}el.replaceChildren(fragmento);el.hidden=!el.childElementCount;if(el.firstElementChild){const topo=el.firstElementChild.offsetTop;let cheio=false;for(const item of Array.from(el.children)){if(cheio||item.offsetTop>topo+2){cheio=true;item.remove();}}}if(!el._horariosResize){let largura=el.clientWidth;el._horariosResize=new ResizeObserver(()=>{if(Math.abs(el.clientWidth-largura)>1){largura=el.clientWidth;renderizarHorariosInicio();}});el._horariosResize.observe(el);}}
async function resumo(){renderizarHorariosInicio();carregarReceitaRotina();carregarFluxoInicio();const btn=document.getElementById('btnAtualizar');btn.disabled=true;const error=document.getElementById('erroResumo');error.hidden=true;try{
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>dateParts.find(p=>p.type===t).value;
 const day=new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00-03:00`);

 const weekStart=new Date(day.getTime()-((day.getUTCDay()+6)%7)*86400000);
 const end=new Date(weekStart.getTime()+7*86400000);
 const params=new URLSearchParams({inicio:weekStart.toISOString(),fim:end.toISOString()});
 const mesAtual=part('year')+'-'+part('month'),inicioMes=new Date(mesAtual+'-01T00:00:00-03:00'),fimMes=new Date(Date.UTC(Number(part('year')),Number(part('month')),1,3));
 const [patients,bookings,monthBookings]=await Promise.allSettled([ler('/api/leads'),ler('/api/agendamentos?'+params),ler('/api/agendamentos?'+new URLSearchParams({inicio:day.toISOString(),fim:fimMes.toISOString()}))]);
 if(patients.status==='rejected'){document.getElementById('aniversariosEstado').textContent='Não foi possível consultar os aniversários. Tente atualizar.';document.getElementById('aniversariosLista').replaceChildren();document.getElementById('aniversariosContagem').textContent='—';throw patients.reason;}
 const ps=dados(patients.value);renderizarAniversarios(ps);
 chaveMesAtual=monthBookings.status==='fulfilled'?mesAtual:'';dadosMesAtual=monthBookings.status==='fulfilled'?dados(monthBookings.value):[];
 const novos=dadosMesAtual.filter(i=>!ehRetorno(i)&&!i.atendido_em&&i.status!=='cancelado'&&i.status!=='realizado'&&new Date(i.data_avaliacao)>=day&&new Date(i.data_avaliacao)<fimMes).sort((a,b)=>new Date(a.data_avaliacao)-new Date(b.data_avaliacao));
 document.getElementById('inicioNovosLista').innerHTML=monthBookings.status==='rejected'?'<p class="empty-state">Não foi possível carregar os agendamentos.</p>':novos.length?novos.slice(0,4).map(i=>'<button type="button" class="inicio-novo-paciente" data-ver-paciente="'+escapar(i.visitante_id)+'"><span>'+escapar(i.paciente?.nome||ps.find(p=>p.visitante_id===i.visitante_id)?.nome||'Paciente')+'</span><time>'+escapar(new Date(i.data_avaliacao).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}))+'</time></button>').join(''):'<p class="empty-state">Nenhum novo atendimento agendado neste mês.</p>';
 if(bookings.status==='rejected')throw bookings.reason;const bs=dados(bookings.value);
 const today=bs.filter(x=>new Date(x.data_avaliacao)>=day&&new Date(x.data_avaliacao)<new Date(day.getTime()+86400000)&&x.status!=='cancelado');
 document.getElementById('agendamentosHoje').textContent=today.length;
 const render=(item)=>`<div class="summary-appointment${item.atendido_em?' is-attended':''}">
  <time>${escapar(new Date(item.data_avaliacao).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}))}</time>
  <div class="today-patient"><strong>${escapar(item.paciente?.nome||ps.find(p=>p.visitante_id===item.visitante_id)?.nome||'Paciente')}</strong><span class="today-confirmation">${item.atendido_em?'Atendido':item.confirmado_em?'Paciente confirmado':'Aguardando confirmação'}</span>${item.atendido_em&&item.retorno_agendado_id?'<small class="today-return-saved">Retorno agendado</small>':''}</div>
  <div class="today-actions">
   ${item.atendido_em&&!item.retorno_agendado_id?`<button type="button" class="today-return" data-retorno="${escapar(item.visitante_id)}" data-origem="${escapar(item.id)}" aria-label="Agendar retorno" title="Agendar retorno"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i><span>Retorno</span></button>`:''}
   <button type="button" class="attendance-toggle" data-attended="${escapar(item.id)}" data-paciente="${escapar(item.visitante_id)}" aria-pressed="${Boolean(item.atendido_em)}" aria-label="${item.atendido_em?'Desmarcar atendimento':'Marcar como atendido'}" title="${item.atendido_em?'Desmarcar atendimento':'Marcar como atendido'}"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
  </div></div>`;
 document.getElementById('agendaResumo').innerHTML=today.length?today.map(render).join(''):'<p class="empty-state">Nenhum horário agendado para hoje.</p>';
 semanaDados=bs.filter(item=>item.status!=='cancelado');
 inicioSemanaLista=weekStart;
 pacientesLista=ps;
 if(!mesLista)mesLista=part('year')+'-'+part('month');
 await carregarListaPeriodo();
}catch(e){error.textContent=e.message;error.hidden=false;document.getElementById('agendaResumo').innerHTML=document.getElementById('agendaSemana').innerHTML='<p class="empty-state">Os dados não foram carregados.</p>';}finally{btn.disabled=false;}}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('btnAtualizar').addEventListener('click',resumo);
 document.getElementById('inicioVerMes').addEventListener('click',()=>{document.getElementById('verPacientesMes').click();document.getElementById('tituloListaPacientes').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});});
 for(const modo of ['Semana','Mes','Retornos'])document.getElementById('verPacientes'+modo).addEventListener('click',()=>{
  modoLista=modo==='Semana'?'semana':modo==='Retornos'?'retornos':'mes';
  carregarListaPeriodo();
 });
 for(const [id,delta] of [['mesPacientesAnterior',-1],['mesPacientesProximo',1]])document.getElementById(id).addEventListener('click',()=>{
  if(!mesLista)return;
  const [ano,mes]=mesLista.split('-').map(Number);
  const data=new Date(Date.UTC(ano,mes-1+delta,1));
  mesLista=data.toISOString().slice(0,7);
  carregarListaPeriodo();
 });
 resumo();
});

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

 const lista=document.getElementById('aniversariosLista');lista.replaceChildren();
 document.getElementById('aniversariosContagem').textContent=String(itens.length);
 const estado=document.getElementById('aniversariosEstado');
 estado.textContent=itens.length?'':'Nenhum aniversário cadastrado para hoje.';estado.hidden=Boolean(itens.length);

 for(const paciente of itens){
  const item=document.createElement('li');const nome=document.createElement('span');nome.textContent=paciente.nome||'Paciente';item.append(nome);
  const url=window.KahennaAniversarios.linkParabens(paciente);
  if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Dar parabéns';link.title='Revisar a mensagem no WhatsApp antes de enviar';link.setAttribute('aria-label',`Preparar parabéns para ${paciente.nome||'paciente'} no WhatsApp`);item.append(link);}
  else{const aviso=document.createElement('small');aviso.textContent='Confira o telefone no cadastro';item.append(aviso);}
  lista.append(item);
 }
}

async function carregarFluxoInicio(){const el=document.getElementById('inicioCaixa');if(!el)return;const admin=document.body.dataset.crmRole==='administrador';el.hidden=!admin;if(!admin)return;const erro=document.getElementById('inicioCaixaErro');try{const mes=window.KahennaAniversarios.hojeBrasil().slice(0,7),d=await ler('/api/caixa/painel?mes='+mes+'&tipo=gastos&pagina=0');for(const [id,k] of [['inicioEntradas','entradas_liquidas'],['inicioSaidas','gastos'],['inicioSaldo','resultado']])document.getElementById(id).textContent=Number(d[k]||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});document.getElementById('inicioSaldo').classList.toggle('is-negative',Number(d.resultado)<0);erro.hidden=true;}catch(e){for(const id of ['inicioEntradas','inicioSaidas','inicioSaldo'])document.getElementById(id).textContent='—';erro.textContent='Não foi possível atualizar o caixa.';erro.hidden=false;}}

document.addEventListener("kahenna:turnos",renderizarHorariosInicio);
