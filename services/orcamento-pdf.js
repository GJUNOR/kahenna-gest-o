'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,StandardFonts,rgb}=require('../lib/vendor/pdf-lib-1.17.1.cjs');
const moeda=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace(/\u00a0/g,' ');
async function gerar(d){
 const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),titulo=await doc.embedFont(StandardFonts.TimesRoman);
 const logo=await doc.embedPng(fs.readFileSync(path.join(__dirname,'../public/logo.png'))),vinho=rgb(.40,.11,.17),texto=rgb(.30,.25,.27),suave=rgb(.59,.48,.52),borda=rgb(.91,.85,.87),fundo=rgb(.98,.96,.96);let page,y;
 const limpar=s=>Array.from(String(s??'').normalize('NFC').replace(/\s+/g,' ')).filter(c=>{try{regular.encodeText(c);return true;}catch{return false;}}).join('');
 const escrever=(s,x,yy,size=10,font=regular,color=texto)=>page.drawText(limpar(s),{x,y:yy,size,font,color});
 const direita=(s,x,yy,size=10,font=regular)=>{const t=limpar(s);escrever(t,x-font.widthOfTextAtSize(t,size),yy,size,font);};
 function linhas(s,width,size=10,font=regular){const words=limpar(s).split(' '),out=[];let atual='';for(const word of words){if(font.widthOfTextAtSize(word,size)>width){if(atual)out.push(atual);atual='';let parte='';for(const c of word){if(font.widthOfTextAtSize(parte+c,size)>width){out.push(parte);parte='';}parte+=c;}atual=parte;continue;}const nova=atual?atual+' '+word:word;if(font.widthOfTextAtSize(nova,size)>width){out.push(atual);atual=word;}else atual=nova;}if(atual)out.push(atual);return out;}
 function nova(){page=doc.addPage([595.28,841.89]);page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(1,.995,.99)});const altura=200*logo.height/logo.width;page.drawImage(logo,{x:46,y:767,width:200,height:altura});escrever('Orçamento',390,780,26,titulo,vinho);page.drawLine({start:{x:46,y:744},end:{x:549,y:744},thickness:1,color:borda});escrever('PACIENTE',46,719,8,bold,suave);y=700;for(const l of linhas(d.paciente,365,13,bold)){escrever(l,46,y,13,bold);y-=17;}direita(new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}),549,719,9);y-=25;}
 function garantir(altura){if(y-altura<76)nova();}
 function cabecalho(){page.drawRectangle({x:46,y:y-9,width:503,height:27,color:fundo});escrever('PROCEDIMENTO',56,y,8,bold,suave);direita('QTD.',360,y,8,bold);direita('UNITÁRIO',453,y,8,bold);direita('TOTAL',539,y,8,bold);y-=32;}
 nova();cabecalho();for(const i of d.itens){const nome=linhas(i.nome,250),h=Math.max(37,nome.length*14+17);if(y-h<76){nova();cabecalho();}nome.forEach((l,n)=>escrever(l,56,y-n*14,10));direita(i.quantidade+(i.unidade==='ml'?' ml':''),360,y,10);direita(moeda(i.valor_unitario),453,y,10);direita(moeda(Number(i.valor_unitario)*i.quantidade),539,y,10,bold);y-=h;page.drawLine({start:{x:46,y:y+14},end:{x:549,y:y+14},thickness:.6,color:borda});}
 garantir(90);y-=12;page.drawRectangle({x:46,y:y-28,width:503,height:51,color:fundo});escrever('VALOR TOTAL',60,y-7,9,bold,vinho);direita(moeda(d.total),535,y-10,21,bold);y-=65;
 garantir(55+d.pagamento.length*26);escrever('Condições de pagamento',46,y,15,titulo,vinho);y-=25;
 const metodos={pix:'Pix',dinheiro:'Dinheiro',debito:'Cartão de débito',credito:'Cartão de crédito'};
 for(const p of d.pagamento){garantir(31);const label=metodos[p.forma_pagamento]+(p.forma_pagamento==='credito'?' · '+p.parcelas+'x sem juros':' · À vista');escrever(label,46,y,10);direita(moeda(p.valor),549,y,11,bold);y-=26;}
 for(const[p,n]of doc.getPages().map((p,n)=>[p,n])){p.drawLine({start:{x:46,y:53},end:{x:549,y:53},thickness:.6,color:borda});p.drawText('Dra. Kahenna Vieira',{x:46,y:35,size:8,font:regular,color:suave});p.drawText((n+1)+' / '+doc.getPageCount(),{x:520,y:35,size:8,font:regular,color:suave});}
 doc.setTitle('Orçamento | Dra. Kahenna Vieira');doc.setAuthor('Kahenna');doc.setSubject('Procedimentos e condições de pagamento');return Buffer.from(await doc.save());
}
module.exports={gerar};
