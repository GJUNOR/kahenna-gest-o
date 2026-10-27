'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {paciente,usuario}=require('./helpers.cjs');
const {randomUUID}=require('node:crypto');
test('Postgres: migração, permissões, atomicidade financeira e arquivamento idempotente',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   grant usage on schema public,auth to service_role;`);
  for(const file of ['database/schema.sql','database/documentos-privados.sql','supabase/migrations/20261026153721_documentos_conferencia_financeiro.sql']) await db.exec(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  await db.query('insert into auth.users(id) values($1)',[usuario.id]);
  await db.query("insert into visitantes(visitante_id,nome,telefone) values($1,'Paciente fictício','11999990000')",[paciente]);
  await db.exec('set role service_role');
  const dados={tipo:'atendimento',valor:100,descricao:'Teste',forma_pagamento:'pix',parcelas:1,registrado_por_email:'teste@example.invalid',registrado_por_nome:'Teste'};
  const op=randomUUID();
  const registrar=(d,id=op)=>db.query('select kahenna_registrar_financeiro($1,$2::jsonb,$3,$4) as r',[paciente,JSON.stringify(d),usuario.id,id]);
  const original=(await registrar(dados)).rows[0].r.lancamento;
  await registrar(dados);assert.equal((await db.query('select count(*)::int as n from lancamentos_financeiros')).rows[0].n,1);
  await assert.rejects(registrar({...dados,valor:101}),/outros dados/);
  const refund={lancamento_id:original.id,valor:70,observacao:'Teste de reembolso'};
  const reembolsar=(d,id)=>db.query('select kahenna_reembolsar_financeiro($1,$2::jsonb,$3,$4)',[paciente,JSON.stringify(d),usuario.id,id]);
  const rid=randomUUID();await reembolsar(refund,rid);await reembolsar(refund,rid);
  await assert.rejects(reembolsar({...refund,valor:40},randomUUID()),/ultrapassa/);
  assert.equal(Number((await db.query("select sum(valor) as total from lancamentos_financeiros where tipo='reembolso'")).rows[0].total),70);
  // Force the patient update to fail: the receipt insert must roll back too.
  await db.exec("reset role; create function public.rejeitar_status() returns trigger language plpgsql as $$begin raise exception 'Falha simulada';end;$$; create trigger teste_rollback before update on visitantes for each row execute function rejeitar_status(); set role service_role;");
  await assert.rejects(registrar(dados,randomUUID()),/Falha simulada/);
  assert.equal((await db.query("select count(*)::int as n from lancamentos_financeiros where tipo='atendimento'")).rows[0].n,1);
  await db.exec('reset role; drop trigger teste_rollback on visitantes; set role service_role;');
  const did=randomUUID(),hash='a'.repeat(64),caminho=`${paciente}/${did}.pdf`;
  await db.query('select kahenna_registrar_documento($1,$2,$3,$4,$5,$6,$7)',[did,paciente,'teste.pdf',caminho,100,hash,usuario.id]);
  const finalizar=()=>db.query('select kahenna_finalizar_documento($1,$2,$3,$4,$5,$6,$7)',[did,paciente,hash,usuario.id,'test-private',`prontuarios/${caminho}`,'v1']);
  await finalizar();await finalizar();
  assert.equal((await db.query("select count(*)::int as n from documentos_auditoria where acao='finalizar'")).rows[0].n,1);
  assert.equal((await db.query("select has_function_privilege('anon','public.kahenna_finalizar_documento(uuid,uuid,text,uuid,text,text,text)','EXECUTE') as ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.kahenna_reembolsar_financeiro(uuid,jsonb,uuid,uuid)','EXECUTE') as ok")).rows[0].ok,false);
  await db.exec('set role anon');await assert.rejects(db.query('select * from documentos_arquivos'),/permission denied/);
 } finally { await db.close(); }
});
