'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {parseTexto,chave}=require('../public/nota-leitura');
test('total da nota prevalece sobre produtos, impostos e despesas adicionais',()=>{
 assert.equal(parseTexto('VALOR TOTAL DOS PRODUTOS\n207,60\nOUTRAS DESPESAS ACESSÓRIAS VALOR TOTAL DA NOTA\n3,00 210,60\nTRANSPORTADOR').total,210.6);
 assert.equal(parseTexto('VALOR DO FRETE DESCONTO VALOR TOTAL DA NOTA\n0,00 0,00 37,00').total,37);
 assert.equal(parseTexto('TOTAL A PAGAR R$ 1.234,56\nTributos 300,00').total,1234.56);
 assert.equal(parseTexto('VALOR TOTAL DOS PRODUTOS 207,60\nVALOR DO ICMS 39,44').total,null);
 assert.equal(parseTexto('Nota ilegível, sem valor reconhecido').total,null);
 assert.equal(chave('5226 1110 9478 9700 0119 5500 1000 1741 5914 5870 0924'),'52261110947897000119550010001741591458700924');
 assert.equal(chave('5226 1110 9478 9700 0119 5500 1000 1741 5914 5870 0925'),null);
});
test('compra simples sem itens desconta do mês uma única vez',async()=>{
 const {pg,db,usuario}=await require('./novidades-local-db.cjs').preparar();try{
 const u=require('./novidades-local-db.cjs').usuario,nota={id:randomUUID(),chave:'2'.repeat(44),descricao:'Mini boca · bolsa vermelha',valor:'210.60',data_pagamento:require('../public/aniversarios').hojeBrasil(),itens:[]};
 const dados=require('../services/notas').validar(nota);const params={p_id:nota.id,p_dados:dados,p_chave:nota.chave,p_usuario:u};assert(!(await db.rpc('kahenna_importar_nota',params)).error);assert((await db.rpc('kahenna_importar_nota',params)).error);
 const painel=await require('../services/caixa').criarServico(db).painel({mes:nota.data_pagamento.slice(0,7)});assert.equal(painel.gastos,210.6);assert.equal(painel.total,1);
 }finally{await pg.close();}
});
