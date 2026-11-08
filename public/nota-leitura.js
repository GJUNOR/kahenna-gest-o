'use strict';
((root)=>{
 const normal=v=>String(v||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const dinheiro=v=>Number(v.replace(/\./g,'').replace(',','.'));
 const valores=s=>[...String(s).matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b|\b\d+,\d{2}\b/g)].map(m=>dinheiro(m[0])).filter(v=>v>0&&v<=1e6);
 function distancia(a,b){let r=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,r[j]+1,r[j-1]+(a[i-1]===b[j-1]?0:1));r=n;}return r[b.length];}
 function chave(texto){for(const linha of String(texto).split(/\r?\n/))for(const m of linha.matchAll(/[\d .-]{44,}/g)){const digitos=m[0].replace(/\D/g,'');for(let offset=0;offset<=digitos.length-44;offset++){const k=digitos.slice(offset,offset+44);if(!['55','65'].includes(k.slice(20,22))||!['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29','31','32','33','35','41','42','43','50','51','52','53'].includes(k.slice(0,2)))continue;let soma=0,peso=2;for(let i=42;i>=0;i--){soma+=Number(k[i])*peso;peso=peso===9?2:peso+1;}const mod=soma%11,digito=mod<2?0:11-mod;if(digito===Number(k[43]))return k;}}return null;}
 function parseTexto(texto){
  const linhas=String(texto).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);let total=null,melhor=Infinity;
  for(let i=0;i<linhas.length;i++){
   const linha=normal(linhas[i]),palavras=linha.replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean);let score=Infinity;
   for(let n=0;n<palavras.length-2;n++)score=Math.min(score,distancia(palavras.slice(n,n+3).join(' '),'total da nota'));
   if(/total\s+a\s+pagar|valor\s+a\s+pagar/.test(linha))score=0;
   if(score>4||score>=melhor)continue;
   const marcador=linha.match(/(?:total\s+(?:da\s+nota|a\s+pagar)|valor\s+a\s+pagar)/),mesma=valores(marcador?linhas[i].slice(marcador.index+marcador[0].length):linhas[i]);
   let candidatos=mesma;
   if(!candidatos.length)for(let j=i+1;j<Math.min(i+4,linhas.length);j++){if(/transportador|dados dos produtos|dados adicionais/i.test(normal(linhas[j])))break;candidatos=valores(linhas[j]);if(candidatos.length)break;}
   if(candidatos.length){total=candidatos.at(-1);melhor=score;}
  }
  // DANFE has two monetary rows in the tax box. The final cell of the
  // second row is the invoice total, even when the small heading is unreadable.
  if(total===null){const inicio=linhas.findIndex(l=>/calculo.*imposto/.test(normal(l))),fim=linhas.findIndex((l,i)=>i>inicio&&/transportador/.test(normal(l)));if(inicio>=0&&fim>inicio){const bloco=linhas.slice(inicio,fim);if(bloco.some(l=>/total.*produt/.test(normal(l)))){const linhasValores=bloco.filter(l=>(l.match(/\d[\d.]*,\d{2}/g)||[]).length>=5);if(linhasValores.length>=2){const ultima=valores(linhasValores.at(-1));if(ultima.length)total=ultima.at(-1);}}}}
  // Coupon-style receipts often use only TOTAL, without the DANFE heading.
  if(total===null)for(const linha of linhas){if(/^\s*(?:valor\s+)?total\s*[:=R$\d]/i.test(normal(linha))&&!/produt|tribut|icms/i.test(linha)){const v=valores(linha);if(v.length){total=v.at(-1);break;}}}
  const fornecedor=(linhas.find(l=>/[it]ndustr|comerc|eireli|ltda|prod\w*\s+medic/i.test(normal(l))&&!/receb|destinat|transport|tribut|cnpj|codigo|informac|impresso|powered|www\./i.test(normal(l))&&l.length<125)||'').replace(/^.*?[—–]\s*/,'').replace(/\bDANFE\b.*$/i,'').replace(/[|]+/g,'').trim();
  const inicio=linhas.findIndex(l=>/dados.*produt/i.test(normal(l)));
  const nomes=inicio<0?[]:linhas.slice(inicio+2,inicio+12).map(l=>l.replace(/^.*?\[/,'').replace(/^[\d\s|_.—-]+/,'').split('|')[0].split(/\blote\b/i)[0].trim()).filter(l=>l.length>=5&&l.length<=100&&/[a-z]{4}/i.test(normal(l))&&!/descricao|codigo|ncm|cfop|quant|valor|d\.?\s*fab|valid|dados|base|icms|aliq|goiania|contrib|reserva|informac|tribut|fabric|impresso/i.test(normal(l))&&(l.match(/[a-z]/gi)||[]).length/l.length>.5);
  const descricao=nomes.slice(0,2).join(' · ').slice(0,200)|| (fornecedor?'Compra · '+fornecedor:'Compra de produtos');
  return {itens:[],total,fornecedor:fornecedor.slice(0,120),descricao,chave:chave(texto),texto:String(texto)};
 }
 const api={parseTexto,chave};root.KahennaNotaLeitura=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
