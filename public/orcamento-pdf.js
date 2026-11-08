'use strict';
(()=>{
 let arquivo,url;
 const $=id=>document.getElementById('orcPdf'+id);
 document.addEventListener('DOMContentLoaded',()=>{
  $('Fechar').onclick=()=>$('Dialog').close();
  $('Dialog').addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);url=null;arquivo=null;});
  $('Compartilhar').onclick=async()=>{if(!arquivo)return;try{await navigator.share({files:[arquivo],title:'Orçamento · Kahenna'});$('Estado').textContent='';}catch(e){if(e.name!=='AbortError')$('Estado').textContent='Você também pode baixar o PDF e anexá-lo na conversa.';}};
 });
 window.KahennaOrcamentoPDF={async abrir(d,nome){
  const r=await fetch('/api/orcamentos/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok){const erro=await r.json();throw Error(erro.mensagem||'Não foi possível gerar o PDF.');}
  const blob=await r.blob(),slug=String(nome||'Paciente').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/gi,'-').slice(0,70);arquivo=new File([blob],'Orcamento-Kahenna-'+slug+'.pdf',{type:'application/pdf'});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(arquivo);$('Baixar').href=url;$('Baixar').download=arquivo.name;$('Paciente').textContent=nome;$('Estado').textContent='';$('Compartilhar').hidden=!(navigator.canShare&&navigator.canShare({files:[arquivo]}));$('Dialog').showModal();
 }};
})();
