'use strict';
(()=>{
 const $=id=>document.getElementById('nota'+id);
 let notas=[],atual=0,ocupado=false,worker=null,foco;
 const status=t=>$('Estado').textContent=t;
 function bloquear(v){ocupado=v;$('Dialog').querySelectorAll('button,input,select').forEach(e=>e.disabled=v);}
 function parseXML(xml){
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XML com conteúdo não permitido.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('O XML não está válido.');
  const tag=(el,n)=>el?.getElementsByTagNameNS('*',n)[0],txt=(el,n)=>tag(el,n)?.textContent?.trim()||'';
  const info=tag(doc,'infNFe');if(!info)throw Error('Envie o XML de uma NF-e de produtos.');
  const produtos=Array.from(info.getElementsByTagNameNS('*','det')).map(det=>{const p=tag(det,'prod'),r=tag(p,'rastro');return {nome:txt(p,'xProd'),quantidade:Number(txt(p,'qCom')),unidade:txt(p,'uCom'),valor:Number(txt(p,'vProd')),lote:txt(r,'nLote'),validade:txt(r,'dVal')};});
  const key=(info.getAttribute('Id')||'').replace(/^NFe/,'');return {itens:produtos,fornecedor:txt(tag(info,'emit'),'xNome'),total:Number(txt(tag(info,'ICMSTot'),'vNF')),chave:/^\d{44}$/.test(key)?key:null,texto:produtos.map(p=>p.nome+' · '+p.quantidade+' '+p.unidade+' · R$ '+p.valor.toFixed(2)).join('\n')};
 }
 async function ocr(image){if(image instanceof Blob){const b=await createImageBitmap(image);try{const scale=Math.min(1,Math.sqrt(24000000/(b.width*b.height))),c=document.createElement('canvas');c.width=Math.max(1,Math.floor(b.width*scale));c.height=Math.max(1,Math.floor(b.height*scale));c.getContext('2d').drawImage(b,0,0,c.width,c.height);image=c;}finally{b.close();}}if(!window.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/assets/ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Não foi possível carregar o leitor de imagens.'));document.head.append(s);});if(!worker)worker=await Tesseract.createWorker('por',1,{workerPath:location.origin+'/assets/ocr/worker.min.js',corePath:location.origin+'/assets/ocr-core',langPath:location.origin+'/assets/ocr-lang',logger:m=>{if(m.status)status('Lendo imagem… '+Math.round((m.progress||0)*100)+'%');}});await worker.setParameters({user_defined_dpi:"300"});return (await worker.recognize(image)).data.text;}
 async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
 async function lerPDF(file){
  const pdfjs=await import('/assets/pdfjs/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/assets/pdfjs/build/pdf.worker.mjs';
  const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,standardFontDataUrl:location.origin+'/assets/pdfjs/standard_fonts/'}),pdf=await loading.promise,resultados=[];
  try{if(pdf.numPages>10)throw Error('Use uma nota com até 10 páginas.');for(let n=1;n<=pdf.numPages;n++){
   status('Lendo página '+n+' de '+pdf.numPages+'…');const page=await pdf.getPage(n),content=await page.getTextContent();let texto=content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');
   if(texto.replace(/\s/g,'').length<30){const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(4,3200/Math.max(base.width,base.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;texto=await ocr(canvas);canvas.width=canvas.height=1;}
   resultados.push({...window.KahennaNotaLeitura.parseTexto(texto),pagina:n});
  }}finally{await loading.destroy();}return resultados;
 }
 function exibir(indice){
  atual=indice;const d=notas[indice];$('Documento').value=String(indice);$('Descricao').value=d.descricao||d.itens?.map(i=>i.nome).slice(0,2).join(' · ').slice(0,200)||'Compra de produtos';$('Fornecedor').value=d.fornecedor||'';$('Total').value=d.total>0?d.total:'';$('Data').value=window.KahennaAniversarios.hojeBrasil();$('Data').max=window.KahennaAniversarios.hojeBrasil();$('Texto').textContent=d.texto||'';$('Conferido').checked=false;$('Form').hidden=false;
  status(notas.length>1?'Cada página será registrada separadamente. Confira o valor e a data desta compra.':d.total>0?'Confira o valor e a data antes de registrar.':'Não consegui identificar o total com segurança. Preencha o valor pago para continuar.');
 }
 function abrir(){foco=document.activeElement;notas=[];atual=0;$('Form').reset();$('Form').hidden=true;$('Arquivo').value='';$('DocumentoCampo').hidden=true;status('');$('Dialog').showModal();}
 document.addEventListener('DOMContentLoaded',()=>{
  if(!$('Dialog'))return;document.getElementById('caixaImportarNota')?.addEventListener('click',abrir);
  $('Fechar').onclick=()=>{if(!ocupado)$('Dialog').close();};$('Dialog').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});$('Dialog').addEventListener('close',()=>{foco?.focus({preventScroll:true});if(worker){worker.terminate();worker=null;}});
  $('Documento').onchange=()=>exibir(Number($('Documento').value));
  $('Arquivo').onchange=async()=>{
   const f=$('Arquivo').files[0];if(!f)return;notas=[];$('Form').hidden=true;$('DocumentoCampo').hidden=true;if(f.size>10*1024*1024){status('Use um arquivo de até 10 MB.');return;}$('Form').hidden=true;$('DocumentoCampo').hidden=true;bloquear(true);
   try{status('Lendo nota…');const buffer=await f.arrayBuffer(),assinatura=await hash(buffer);let lista;
    if(/\.xml$/i.test(f.name))lista=[parseXML(new TextDecoder().decode(buffer))];else if(f.type==='application/pdf'||/\.pdf$/i.test(f.name))lista=await lerPDF(f);else if(['image/jpeg','image/png'].includes(f.type))lista=[window.KahennaNotaLeitura.parseTexto(await ocr(f))];else throw Error('Selecione XML, PDF, JPEG ou PNG.');
    const agrupadas=[];for(const d of lista){const existente=d.chave&&agrupadas.find(n=>n.chave===d.chave);if(existente){existente.texto+='\n'+d.texto;if(!(existente.total>0)&&d.total>0)existente.total=d.total;}else agrupadas.push(d);}
    notas=await Promise.all(agrupadas.map(async(d,i)=>({...d,op:crypto.randomUUID(),chave:d.chave||await hash(new TextEncoder().encode(assinatura+':pagina:'+i)),salva:false})));
    $('Documento').innerHTML=notas.map((d,i)=>`<option value="${i}">Página ${i+1}${d.total>0?' · '+Number(d.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):''}</option>`).join('');$('DocumentoCampo').hidden=notas.length<2;exibir(0);
   }catch(e){status(e.message);}finally{bloquear(false);}
  };
  $('Form').addEventListener('input',e=>{if(e.target!==$('Conferido'))$('Conferido').checked=false;});
  $('Form').onsubmit=async e=>{
   e.preventDefault();if(ocupado||!$('Conferido').checked)return;const d=notas[atual];if(!d||d.salva)return;bloquear(true);
   try{const r=await fetch('/api/caixa/importar-nota',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.op,chave:d.chave,itens:d.itens||[],tipo:'compra',categoria:'Produtos',descricao:$('Descricao').value,fornecedor:$('Fornecedor').value,valor:$('Total').value,data_pagamento:$('Data').value,observacao:'Compra conferida a partir de nota'})}),dados=await r.json();if(!r.ok)throw Error(dados.mensagem||'Não foi possível registrar a compra.');
    d.salva=true;const opcao=$('Documento').options[atual];opcao.disabled=true;opcao.textContent+=' · Registrada';document.getElementById('caixaAtualizar')?.click();const feedback=document.getElementById('caixaFeedback');feedback.hidden=false;feedback.textContent='Compra registrada no Caixa.';const proxima=notas.findIndex(n=>!n.salva);if(proxima<0)$('Dialog').close();else exibir(proxima);
   }catch(e){status(e.message);}finally{bloquear(false);}
  };
 });
 window.KahennaNotas={parseXML,parseTexto:texto=>window.KahennaNotaLeitura.parseTexto(texto)};
})();
