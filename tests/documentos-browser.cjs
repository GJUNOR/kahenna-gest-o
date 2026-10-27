'use strict';
// End-to-end browser test using synthetic database and S3 adapters only.
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const express=require('express'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.KAHENNA_PLAYWRIGHT_MODULE || 'playwright');
const {fake,paciente,usuario}=require('./helpers.cjs');
const client=fake(),objects=new Map();let writes=0,fail=false;
const s3={async gravar(chave,buffer){if(fail)throw Object.assign(new Error('Falha simulada. O PDF foi mantido no Supabase.'),{statusCode:503});writes++;objects.set(chave,buffer);return {bucket:'test-bucket',chave,versao:'v1'};},async baixar(a){return objects.get(a.chave_s3);}};
const app=express();app.use((req,res,next)=>{req.usuario=usuario;next();});
app.use('/api/pacientes',require('../routes/documentos')(client,undefined,s3));
app.get('/api/auth/session',(req,res)=>res.json({usuario:{...usuario,papel:'administrador'}}));
app.get('/api/leads',(req,res)=>res.json([{visitante_id:paciente,nome:'Paciente Fictício - Conferência',telefone:'11999990000',criado_em:new Date().toISOString(),status:'novo'}]));
app.get('/api/financeiro/movimentacoes-do-dia',(req,res)=>res.json({visitante_ids:[],movimentacoes:[]}));
app.get('/api/conversoes/resumo',(req,res)=>res.json({sucesso:true,receitaHoje:0,receitaMes:0}));
app.get('/api/agendamentos/hoje',(req,res)=>res.json({data:[]}));
for(const pasta of ['build','standard_fonts','wasm','cmaps'])app.use('/assets/pdfjs/'+pasta,express.static(path.join(__dirname,'../node_modules/pdfjs-dist',pasta)));
app.use(express.static(path.join(__dirname,'../public')));
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let browser;
 try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/leads.html`);
  await page.locator('[data-documentos-paciente]').first().click();
  const pdf=process.env.KAHENNA_TEST_PDF || path.join(__dirname,'fixtures/teste-prontuario.pdf');
  await page.locator('#documentosArquivo').setInputFiles(pdf);
  await page.locator('#documentosEnviar').click();
  await page.getByText('PDF salvo para conferência. Ele ainda não foi enviado ao S3.').waitFor();
  assert.equal(writes,0);assert.equal(client.objects.size,1);
  await page.getByRole('button',{name:'Conferir PDF',exact:true}).click();
  const paginas=Number(process.env.KAHENNA_TEST_PAGES || 1);
  await page.getByText(`Página 1 de ${paginas}`,{exact:true}).waitFor();
  assert.equal(await page.locator('#documentosZoom').inputValue(),'0.8');
  if(paginas>1){assert.equal(await page.locator('#documentosConferido').isDisabled(),true);for(let i=2;i<=paginas;i++){await page.locator('#documentosProxima').click();await page.getByText(`Página ${i} de ${paginas}`,{exact:true}).waitFor();}}
  await page.locator('#documentosZoom').selectOption('1.5');
  assert.equal(await page.locator('#documentosPagina').evaluate(c=>c.style.width),'150%');
  await page.locator('#documentosZoom').selectOption('0.8');
  await page.waitForFunction(()=>document.getElementById('documentosConferido').disabled===false);
  assert.equal(await page.locator('#documentosFinalizar').isDisabled(),true);
  await page.locator('#documentosConferido').check();
  fs.mkdirSync(path.join(__dirname,'../../outputs/documentos'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'../../outputs/documentos/conferencia-desktop.png')});
  fail=true;await page.locator('#documentosFinalizar').click();
  await page.getByText('Não foi possível concluir a operação. Verifique a configuração e tente novamente.',{exact:true}).waitFor();
  assert.equal(client.objects.size,1);assert.equal(client.archives.size,0);
  fail=false;await page.locator('#documentosFinalizar').click();
  await page.getByText('PDF conferido e arquivado. A cópia temporária foi removida.',{exact:true}).waitFor();
  assert.equal(writes,1);assert.equal(client.objects.size,0);assert.equal(client.archives.size,1);
  await page.getByRole('button',{name:'Ver PDF',exact:true}).click();
  await page.getByRole('heading',{name:'Documento arquivado',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(__dirname,'../../outputs/documentos/arquivado-mobile.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Browser OK: envio temporário, conferência, confirmação, falha recuperável, arquivamento e consulta; desktop e celular.');
 } finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
