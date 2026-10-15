'use strict';
(()=>{
 const dialog=document.getElementById('reminderDialog'),form=document.getElementById('reminderForm');
 const date=document.getElementById('reminderDate'),time=document.getElementById('reminderTime'),message=document.getElementById('reminderMessage'),hint=document.getElementById('reminderHint'),error=document.getElementById('reminderError');
 let patient=null,sequence=0,previousFocus=null;
 function parts(d){const values=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const get=t=>values.find(p=>p.type===t).value;return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};}
 function draft(){if(!patient)return;const [y,m,d]=date.value.split('-');message.value=`Olá, ${String(patient.nome||'').trim()}! Tudo bem?\n\nPassando para lembrar do seu atendimento com a Dra. Kahenna Vieira${date.value?' no dia '+d+'/'+m+'/'+y:''}${time.value?', às '+time.value:''}.\n\nVocê pode confirmar sua presença? Será um prazer receber você!`;}
 function close(){sequence++;dialog.close();previousFocus?.focus();}
 document.getElementById('closeReminder').addEventListener('click',close);document.getElementById('cancelReminder').addEventListener('click',close);
 dialog.addEventListener('cancel',()=>{sequence++;});date.addEventListener('change',draft);time.addEventListener('change',draft);
 window.abrirLembretePaciente=async lead=>{
  patient=lead;previousFocus=document.activeElement;const attempt=++sequence;error.hidden=true;form.reset();date.min=parts(new Date()).date;document.getElementById('reminderPatient').textContent=lead.nome||'Paciente';hint.textContent='Buscando o próximo horário…';draft();dialog.showModal();
  try{
   const inicio=new Date(),fim=new Date(inicio.getTime()+366*86400000);
   const query=new URLSearchParams({inicio:inicio.toISOString(),fim:fim.toISOString()});
   const response=await fetch('/api/agendamentos?'+query,{cache:'no-store'});
   if(!response.ok)throw new Error('Não foi possível consultar a agenda.');
   const result=await response.json();if(attempt!==sequence||!dialog.open)return;
   const items=Array.isArray(result)?result:(result.data||[]);
   const next=items.filter(x=>String(x.visitante_id)===String(lead.visitante_id)&&x.status!=='cancelado'&&new Date(x.data_avaliacao)>=inicio).sort((a,b)=>new Date(a.data_avaliacao)-new Date(b.data_avaliacao))[0];
   if(next){const p=parts(new Date(next.data_avaliacao));date.value=p.date;time.value=p.time;hint.textContent='Data e horário preenchidos com o próximo agendamento.';}else{hint.textContent='Nenhum próximo horário encontrado. Informe a data e o horário antes de enviar o lembrete.';}
   draft();
  }catch(e){if(attempt===sequence&&dialog.open)hint.textContent='Não foi possível carregar a agenda. Informe a data e o horário manualmente.';}
 };
 form.addEventListener('submit',event=>{
  event.preventDefault();error.hidden=true;const phone=String(patient?.telefone||'').replace(/\D/g,'');const number=phone.length===10||phone.length===11?'55'+phone:phone;
  if(!/^55\d{10,11}$/.test(number)){error.textContent='Confira o telefone do paciente antes de preparar o lembrete.';error.hidden=false;return;}
  const when=new Date(`${date.value}T${time.value}:00-03:00`);
  if(!date.value||!time.value||!Number.isFinite(when.getTime())||when<new Date()){error.textContent='Selecione uma data e um horário futuros.';error.hidden=false;return;}
  if(!message.value.trim()){error.textContent='Escreva uma mensagem antes de abrir o WhatsApp.';error.hidden=false;return;}
  window.open('https://wa.me/'+number+'?text='+encodeURIComponent(message.value.trim()),'_blank','noopener,noreferrer');
 });
})();
