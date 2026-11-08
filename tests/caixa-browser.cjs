'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('C:/Users/gusta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const local=await require('./caixa-preview.cjs').iniciar(),browser=await chromium.launch({channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:850}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.goto(local.url+'/estoque.html');await page.locator('#caixaGastos').filter({hasText:'0,00'}).waitFor();
 await page.getByRole('button',{name:'Registrar compra',exact:true}).click();
 await page.locator('#caixaDescricao').fill('Cânulas locais');await page.locator('#caixaValor').fill('120');await page.locator('#caixaSalvar').click();
 await page.locator('#caixaGastos').filter({hasText:'120,00'}).waitFor();
 await page.locator('#caixaBusca').fill('canula');await page.locator('.cash-row').waitFor();
 await page.getByRole('button',{name:'Editar Cânulas locais'}).click();await page.locator('#caixaValor').fill('150');await page.locator('#caixaSalvar').click();await page.locator('#caixaGastos').filter({hasText:'150,00'}).waitFor();
 await page.getByRole('button',{name:'Taxas do cartão',exact:true}).click();assert.equal(await page.locator('[data-caixa-taxa="maquininha:visa_mastercard:credito:6"]').inputValue(),'8.28');
 await page.locator('#caixaTaxasCanal').selectOption('link');assert.equal(await page.locator('[data-caixa-taxa="link:todas:credito:6"]').inputValue(),'9.67');await page.locator('#caixaTaxasSalvar').click();await page.locator('#caixaTaxasDialog').waitFor({state:'hidden'});
 for(const width of [1366,1024,768,390,360]){
 await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`page overflow ${width}`);
 await page.getByRole('button',{name:'Registrar compra',exact:true}).click();assert(await page.locator('#caixaDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`dialog overflow ${width}`);await page.locator('#caixaDialog [data-caixa-fechar]').first().click();
 }
 await page.setViewportSize({width:1366,height:850});await page.screenshot({path:path.join(__dirname,'../../tmp/caixa-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Excluir Cânulas locais'}).click();await page.locator('#caixaExcluirConfirmar').click();await page.locator('#caixaGastos').filter({hasText:'0,00'}).waitFor();
 await page.goto(local.url+'/leads.html');await page.waitForFunction(()=>Boolean(window.KahennaPacientes));
 await page.evaluate(p=>window.KahennaPacientes.financeiro({visitante_id:p,id:p,nome:'Paciente local',telefone:'11999990000'}),local.paciente);
 await page.locator('#financeiroPagamentoAvaliacao').selectOption('credito');await page.locator('#financeiroBandeira').selectOption('visa');await page.locator('#financeiroParcelasAtendimento').selectOption('6');
 assert.equal(await page.locator('#financeiroParcelasAtendimento option').count(),6);
 await page.locator('#financeiroValorLivre').fill('100000');await page.locator('#financeiroValorLivre').dispatchEvent('input');await page.locator('#financeiroTaxaPrevia').filter({hasText:'917,20'}).waitFor();
 await page.locator('#financeiroCanal').selectOption('link');await page.locator('#financeiroTaxaPrevia').filter({hasText:'903,30'}).waitFor();
 await page.locator('#financeiroDescricao').fill('Pagamento fictício local');
 await page.locator('#registrarAvaliacao').click();await page.locator('#financeiroFeedback').filter({hasText:'Lançamento registrado'}).waitFor();
 const recibo=(await local.pg.query('select valor,taxa_valor,canal_pagamento,parcelas from lancamentos_financeiros')).rows[0];
 assert.equal(Number(recibo.valor),1000);assert.equal(Number(recibo.taxa_valor),96.7);assert.equal(recibo.canal_pagamento,'link');assert.equal(recibo.parcelas,6);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'../../tmp/cartao-mobile.png'),fullPage:true});
 assert.deepEqual(erros,[]);console.log('Caixa e cartão: CRUD, taxas, busca sem acentos e layouts 360–1366px OK');
 }finally{await browser.close();await local.fechar();}
})().catch(e=>{console.error(e);process.exitCode=1;});

