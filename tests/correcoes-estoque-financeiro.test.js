'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';
process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');
const produtoId='11111111-1111-4111-8111-111111111111',usuarioId='33333333-3333-4333-8333-333333333333';
test('financeiro abre sem o campo antigo e ignora resposta de outro paciente',async()=>{
 const elementos=new Map();
 for(const id of ['modalEdicaoOverlay','financeiroTotalPaciente','listaFinanceiroPaciente','tituloModalEdicao','financeiroFeedback','financeiroDescricao'])elementos.set(id,{textContent:'',hidden:false,classList:{add(){this.open=true;},remove(){}},setAttribute(){},focus(){}});
 let resolver;
 const contexto=vm.createContext({console,document:{addEventListener(){},getElementById(id){return elementos.get(id)||null;},body:{classList:{add(){},remove(){}}}},window:{setTimeout(fn){fn();}},fetch:()=>new Promise(r=>{resolver=r;}),URLSearchParams,setTimeout,clearTimeout,Intl});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/leads.js'),'utf8'),contexto);
 await vm.runInContext(`abrirModalEdicao({visitante_id:'${produtoId}',nome:'Paciente fictício'})`,contexto);
 assert.equal(elementos.get('modalEdicaoOverlay').classList.open,true);
 assert.match(elementos.get('tituloModalEdicao').textContent,/Paciente fictício/);
 vm.runInContext("leadEmEdicao={visitante_id:'22222222-2222-4222-8222-222222222222'}",contexto);
 resolver({ok:true,json:async()=>({total:999,lancamentos:[]})});
 await new Promise(r=>setImmediate(r));
 assert.equal(elementos.get('financeiroTotalPaciente').textContent,'Carregando…');
 await vm.runInContext(`abrirModalEdicao({visitante_id:'${produtoId}',nome:'Paciente fictício'})`,contexto);
 resolver({ok:true,json:async()=>({total:100,lancamentos:[]})});
 await new Promise(r=>setImmediate(r));
 assert.match(elementos.get('financeiroTotalPaciente').textContent,/100,00/);
 assert.match(elementos.get('listaFinanceiroPaciente').innerHTML,/Nenhum lançamento/);
});
test('estoque: excluir/restaurar exige administrador e altera apenas ativo',async()=>{
 let registro={id:produtoId,nome:'Produto fictício',ativo:true,quantidade:5,valor_estoque:50},gravacoes=0;
 const db={from(tabela){assert.equal(tabela,'estoque_produtos');let patch,filtro;const b={update(d){patch=d;return b;},eq(k,v){assert.equal(k,'id');filtro=v;return b;},select(){return b;},async maybeSingle(){if(filtro!==produtoId)return {data:null};assert.deepEqual(Object.keys(patch),['ativo']);registro={...registro,...patch};gravacoes++;return {data:registro};}};return b;}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{const papel=req.get('x-role');if(papel)req.usuario={id:usuarioId,app_metadata:{papel,ativo:true}};next();});app.use('/api/estoque',require('../routes/estoque')(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/estoque/produtos/`;
 try{
  for(const [papel,status] of [[null,401],['secretaria',403]])for(const [metodo,sufixo] of [['DELETE',''],['POST','/restaurar']])assert.equal((await fetch(url+produtoId+sufixo,{method:metodo,headers:papel?{'x-role':papel}:{}})).status,status);
  assert.equal(gravacoes,0);
  const op={method:'DELETE',headers:{'x-role':'administrador'}};
  assert.equal((await fetch(url+'invalido',op)).status,400);
  assert.equal((await fetch(url+'22222222-2222-4222-8222-222222222222',op)).status,404);
  for(let i=0;i<2;i++)assert.equal((await fetch(url+produtoId,op)).status,200);
  assert.equal(registro.ativo,false);assert.equal(registro.quantidade,5);assert.equal(registro.valor_estoque,50);
  assert.equal((await fetch(url+produtoId+'/restaurar',{...op,method:'POST'})).status,200);assert.equal(registro.ativo,true);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Postgres: exclusão com saldo é recuperável e preserva os custos históricos',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261026130322_estoque.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261103013557_estoque_exclusao_recuperavel.sql'),'utf8'));
  await db.query('insert into auth.users(id) values($1)',[usuarioId]);await db.exec('set role service_role');
  await db.query("insert into estoque_produtos(id,nome,unidade) values($1,'Produto fictício','un')",[produtoId]);
  await db.query("select kahenna_movimentar_estoque(gen_random_uuid(),$1,'entrada',5,10,(now() at time zone 'America/Sao_Paulo')::date,'Teste','',$2)",[produtoId,usuarioId]);
  await db.query('update estoque_produtos set ativo=false where id=$1',[produtoId]);
  const resumo=()=>db.query("select kahenna_estoque_resumo(date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)::date,(date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)+interval '1 month')::date) as r");
  let r=(await resumo()).rows[0].r;assert.equal(r.valor_estoque,0);assert.equal(r.compras_mes,50);
  await assert.rejects(db.query("select kahenna_movimentar_estoque(gen_random_uuid(),$1,'saida',1,null,(now() at time zone 'America/Sao_Paulo')::date,'Teste','',$2)",[produtoId,usuarioId]),/Reative/);
  await db.query('update estoque_produtos set ativo=true where id=$1',[produtoId]);r=(await resumo()).rows[0].r;assert.equal(r.valor_estoque,50);
  assert.equal((await db.query('select quantidade::float as q from estoque_produtos')).rows[0].q,5);
  assert.equal((await db.query('select count(*)::int as n from estoque_movimentos')).rows[0].n,1);
  await db.exec('set role anon');await assert.rejects(db.query('update estoque_produtos set ativo=false'),/permission denied/);
 }finally{await db.close();}
});
