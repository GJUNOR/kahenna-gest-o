'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {preparar,adapter,usuario,paciente}=require('./caixa-local-db.cjs');
const {criarServico}=require('../services/caixa'),{hojeBrasil}=require('../public/aniversarios');
test('Caixa: gastos idempotentes, revisão, taxas por canal/bandeira e limite de 6x',async()=>{
 const pg=await preparar();try{
 const caixa=criarServico(adapter(pg)),user={id:usuario},dia=hojeBrasil(),mes=dia.slice(0,7);
 const d={id:randomUUID(),tipo:'compra',descricao:'Cânulas teste local',categoria:'Produtos',valor:80,data_pagamento:dia,quantidade:2,unidade:'Caixas'};
 const saved=await caixa.salvar(d,user);await caixa.salvar(d,user);
 assert.equal((await caixa.painel({mes})).gastos,80);
 assert.equal((await caixa.painel({mes,busca:'canula'})).total,1);
 await caixa.salvar({...d,valor:100,revisao:saved.revisao},user);
 await assert.rejects(caixa.salvar({...d,valor:90,revisao:0},user),/mudou/);
 const dados={tipo:'atendimento',valor:1000,descricao:'Teste local',forma_pagamento:'credito',parcelas:6,canal_pagamento:'maquininha',bandeira:'visa'};
 async function receipt(d,id=randomUUID()) {return (await pg.query('select kahenna_registrar_financeiro($1,$2::jsonb,$3,$4) r',[paciente,JSON.stringify(d),usuario,id])).rows[0].r.lancamento;}
 const id=randomUUID(),sale=await receipt(dados,id);await receipt(dados,id);assert.equal(Number(sale.taxa_valor),82.8);
 assert.equal(Number((await receipt({...dados,bandeira:'elo'})).taxa_valor),93.3);
 assert.equal(Number((await receipt({...dados,canal_pagamento:'link'})).taxa_valor),96.7);
 assert.equal(Number((await receipt({...dados,forma_pagamento:'debito',parcelas:1})).taxa_valor),13.7);
 await assert.rejects(receipt({...dados,parcelas:7}),/inválidos/);
 await assert.rejects(receipt({...dados,bandeira:'outras'}),/Cadastre a taxa/);
 await assert.rejects(receipt({...dados,forma_pagamento:'debito',canal_pagamento:'link',parcelas:1}),/canal/);
 const config=await caixa.taxas();await caixa.salvarTaxas({taxas:{...config.taxas,'maquininha:visa_mastercard:credito:6':9},revisao:config.revisao},user);
 assert.equal(Number((await receipt(dados)).taxa_valor),90);
 assert.equal(Number((await pg.query('select taxa_valor from lancamentos_financeiros where id=$1',[sale.id])).rows[0].taxa_valor),82.8);
 const totals=await caixa.painel({mes,tipo:'entradas'});assert.equal(totals.entradas_brutas,5000);assert.equal(totals.taxas_cartao,376.5);assert.equal(totals.resultado,4523.5);
 await caixa.excluir({id:d.id,origem:'despesa',revisao:1},user);await caixa.excluir({id:d.id,origem:'despesa',revisao:1},user);assert.equal((await caixa.painel({mes})).gastos,0);
 const produto=randomUUID(),movimento=randomUUID();
 await pg.exec('reset role');await pg.query("insert into estoque_produtos(id,nome,unidade) values($1,'Compra anterior preservada','un')",[produto]);await pg.exec('set role service_role');
 await pg.query("select kahenna_movimentar_estoque($1,$2,'entrada',2,20,$3,'Compra anterior','',$4)",[movimento,produto,dia,usuario]);
 assert.equal((await caixa.painel({mes})).gastos,40);
 await caixa.excluir({id:movimento,origem:'compra_anterior'},user);assert.equal((await caixa.painel({mes})).gastos,0);
 assert.equal(Number((await pg.query('select valor_estoque from estoque_produtos where id=$1',[produto])).rows[0].valor_estoque),40);
 assert.equal((await pg.query("select has_table_privilege('anon','caixa_despesas','SELECT') ok")).rows[0].ok,false);
 assert.equal((await pg.query("select has_function_privilege('authenticated','kahenna_caixa_painel(date,date,integer,text,text)','EXECUTE') ok")).rows[0].ok,false);
 }finally{await pg.close();}
});
