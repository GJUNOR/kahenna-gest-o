'use strict';
(()=>{
 document.addEventListener('DOMContentLoaded',()=>{
  const botao=document.getElementById('editarTurnosClinica');if(!botao)return;
  const dialog=document.getElementById('turnosDialog'),form=document.getElementById('turnosForm'),dia=document.getElementById('turnosData'),periodo=document.getElementById('turnosPeriodo'),estado=document.getElementById('turnosEstado'),salvar=document.getElementById('turnosSalvar');let ocupado=false,revisao=null,foco;
  const mostrar=()=>{const atual=window.KahennaTurnosClinica.obter(dia.value);periodo.value=atual?.periodo||'Sem atendimento';revisao=window.KahennaTurnosClinica.revisao(dia.value);estado.textContent='';};
  botao.onclick=async()=>{foco=document.activeElement;dia.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());estado.textContent='Carregando…';salvar.disabled=true;dialog.showModal();try{await window.KahennaTurnosClinica.atualizar();mostrar();dia.focus();}catch(e){estado.textContent=e.message;}finally{salvar.disabled=false;}};
  dia.onchange=mostrar;document.getElementById('turnosFechar').onclick=()=>{if(!ocupado)dialog.close();};dialog.addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});dialog.addEventListener('close',()=>foco?.focus({preventScroll:true}));
  botao.disabled=false;
  form.onsubmit=async e=>{e.preventDefault();if(ocupado)return;ocupado=true;form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);estado.textContent='Salvando…';try{const r=await fetch('/api/turnos-clinica',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({dia:dia.value,periodo:periodo.value,revisao})}),d=await r.json();if(!r.ok)throw Error(d.mensagem||'Não foi possível salvar.');window.KahennaTurnosClinica.aplicar(d.turno);dialog.close();}catch(e){estado.textContent=e.message;}finally{ocupado=false;form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);}};
 });
})();
