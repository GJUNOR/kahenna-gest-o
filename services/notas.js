'use strict';
const {despesa}=require('./caixa');
const fail=mensagem=>Object.assign(Error(mensagem),{statusCode:400});
function validar(d){
 if(!/^(?:\d{44}|[a-f0-9]{64})$/.test(d.chave||'')||!Array.isArray(d.itens)||!d.itens.length||d.itens.length>100)throw fail('Confira a nota e seus produtos.');
 const itens=d.itens.map(i=>{if(typeof i.nome!=='string'||!i.nome.trim()||i.nome.length>200||!Number.isFinite(i.quantidade)||i.quantidade<=0||i.quantidade>1e8||!Number.isFinite(i.valor)||i.valor<0||i.valor>1e6||Math.abs(i.valor*100-Math.round(i.valor*100))>.00001)throw fail('Confira os nomes, quantidades e valores dos itens.');for(const k of ['unidade','lote','validade'])if(typeof(i[k]||'')!=='string'||(i[k]||'').length>120)throw fail('Detalhes do item inválidos.');return {nome:i.nome.trim(),quantidade:i.quantidade,valor:i.valor,unidade:i.unidade||'',lote:i.lote||'',validade:i.validade||''};});
 return {...despesa({...d,tipo:'compra',categoria:'Produtos'}),nota_itens:itens};
}
module.exports={validar};
