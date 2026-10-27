'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict');
const {criarServico}=require('../services/documentos');
const {fake,paciente,outro,usuario,pdf}=require('./helpers.cjs');
function arquivo(options={}) {const objects=new Map();let writes=0;return {objects,get writes(){return writes;},async gravar(chave,buffer,hash){writes++;if(options.writeFails)throw new Error('S3 unavailable');objects.set(chave,Buffer.from(buffer));return {bucket:'test-private',chave,versao:'version-1'};},async baixar(a){if(options.readFails)throw new Error('read unavailable');return options.corrupted?Buffer.from('corrompido'):objects.get(a.chave_s3);}};}
test('PDF permanece no Supabase até confirmação explícita e hash da conferência',async()=>{
 const db=fake(),s3=arquivo(),s=criarServico(db,s3),d=await s.enviar(paciente,usuario,pdf,'teste.pdf');
 assert.equal(s3.writes,0);assert.equal((await s.listar(paciente,usuario))[0].estado,'pendente');
 await assert.rejects(s.finalizar(paciente,d.id,usuario,{conferido:false,sha256:d.sha256}),{statusCode:400});
 await assert.rejects(s.finalizar(paciente,d.id,usuario,{conferido:true,sha256:'outro'}),{statusCode:409});
 assert.equal(s3.writes,0);assert.equal(db.objects.size,1);
});
test('finalização confirma cópia, audita, libera temporário e consulta versão arquivada',async()=>{
 const db=fake(),s3=arquivo(),s=criarServico(db,s3),d=await s.enviar(paciente,usuario,pdf,'teste.pdf');
 const r=await s.finalizar(paciente,d.id,usuario,{conferido:true,sha256:d.sha256});
 assert.equal(r.estado,'arquivado');assert.equal(db.objects.size,0);assert.equal(db.archives.size,1);
 assert.equal((await s.listar(paciente,usuario))[0].estado,'arquivado');
 assert.deepEqual((await s.baixar(paciente,d.id,usuario)).buffer,pdf);
 await s.finalizar(paciente,d.id,usuario,{conferido:true,sha256:d.sha256});assert.equal(s3.writes,1);
 assert.equal(db.audits.filter(a=>a.acao==='finalizar').length,1);
});
test('falhas de cópia, integridade, commit e limpeza não perdem o PDF',async()=>{
 for(const [dbOpt,s3Opt] of [[{},{writeFails:true}],[{},{corrupted:true}],[{finalizationFails:true},{}]]){
  const db=fake(dbOpt),s3=arquivo(s3Opt),s=criarServico(db,s3),d=await s.enviar(paciente,usuario,pdf,'teste.pdf');
  await assert.rejects(s.finalizar(paciente,d.id,usuario,{conferido:true,sha256:d.sha256}));assert.equal(db.objects.size,1);
 }
 const options={cleanupFails:true},db=fake(options),s3=arquivo(),s=criarServico(db,s3),d=await s.enviar(paciente,usuario,pdf,'teste.pdf');
 assert.equal((await s.finalizar(paciente,d.id,usuario,{conferido:true,sha256:d.sha256})).limpeza_pendente,true);assert.equal(db.objects.size,1);
 options.cleanupFails=false;assert.equal((await s.finalizar(paciente,d.id,usuario,{conferido:true,sha256:d.sha256})).limpeza_pendente,false);assert.equal(db.objects.size,0);assert.equal(s3.writes,1);
});
test('não finaliza documento de outro paciente; conferência é auditada',async()=>{
 const db=fake(),s3=arquivo(),s=criarServico(db,s3),d=await s.enviar(paciente,usuario,pdf,'teste.pdf');
 await assert.rejects(s.finalizar(outro,d.id,usuario,{conferido:true,sha256:d.sha256}),{statusCode:404});
 const visto=await s.baixar(paciente,d.id,usuario,'conferir');assert.equal(visto.sha256,d.sha256);assert.equal(db.audits.at(-1).acao,'conferir');
});
