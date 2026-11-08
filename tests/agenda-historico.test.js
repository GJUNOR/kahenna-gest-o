'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict');
const db=require('../config/supabase'),service=require('../services/agendamentos');
test('agenda: nova visita insere registro; reagendamento exige ID e paciente corretos',async()=>{
 const original=db.from;let inserts=0,updates=0;const historico={id:4,visitante_id:'paciente',data_avaliacao:'2020-01-01T12:00:00Z',status:'realizado'};
 db.from=table=>{let mode='select';const filters={};const b={select(){return b;},eq(k,v){filters[k]=v;return b;},neq(){return b;},limit(){return b;},update(){mode='update';return b;},insert(){inserts++;return b;},async maybeSingle(){return {data:filters.status==='agendado'?null:historico};},async single(){if(mode==='update')updates++;return {data:{id:10}};},then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}};return b;};
 try{await service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-01T12:00:00Z'});assert.equal(inserts,1);assert.equal(updates,0);assert.equal(historico.status,'realizado');await assert.rejects(service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-01T12:00:00Z',agendamentoId:4}),{statusCode:409});assert.equal(updates,0);}finally{db.from=original;}
});

test('agenda: marcação de atendido é reversível e recusa valores inválidos',async()=>{
 const original=db.from;let patch;
 db.from=()=>{const b={update(value){patch=value;return b;},eq(){return b;},neq(){return b;},select(){return b;},async maybeSingle(){return {data:{id:1,...patch}};}};return b;};
 try{
  const marcado=await service.atualizarAcompanhamento('1',{atendido:true});
  assert.ok(Number.isFinite(Date.parse(marcado.atendido_em)));
  const desmarcado=await service.atualizarAcompanhamento('1',{atendido:false});
  assert.equal(desmarcado.atendido_em,null);
  await assert.rejects(service.atualizarAcompanhamento('1',{atendido:'sim'}),{statusCode:400});
 }finally{db.from=original;}
});

test('agenda: retorno fica vinculado somente ao atendimento correto e posterior',async()=>{
 const original=db.from;let inserted;
 db.from=table=>{const filters={};let mode='select';const b={select(){return b;},eq(k,v){filters[k]=v;return b;},neq(){return b;},limit(){return b;},insert(value){mode='insert';inserted=value;return b;},update(){return b;},async maybeSingle(){return {data:filters.id===1&&filters.visitante_id==='paciente'?{id:1,visitante_id:'paciente',status:'agendado',atendido_em:'2030-01-01T14:00:00Z',data_avaliacao:'2030-01-01T12:00:00Z'}:null};},async single(){return {data:{id:2,...inserted}};},then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}};return b;};
 try{
  const r=await service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-02T12:00:00Z',retornoDe:1});
  assert.equal(r.retorno_de,1);
  await assert.rejects(service.criarOuAtualizarAgendamento({visitanteId:'outro',dataAvaliacao:'2030-01-02T12:00:00Z',retornoDe:1}),{statusCode:400});
  await assert.rejects(service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2029-01-01T12:00:00Z',retornoDe:1}),{statusCode:400});
 }finally{db.from=original;}
});

test('agenda: botão de retorno sem origem explícita vincula o último atendimento concluído',async()=>{const original=db.from;let inserted,temAnterior=true;db.from=table=>{const f={};const b={select(){return b;},eq(k,v){f[k]=v;return b;},neq(){return b;},not(k){f.naoNulo=k;return b;},lt(k,v){f.antes=v;return b;},order(){return b;},limit(){return b;},insert(v){inserted=v;return b;},update(){return b;},async maybeSingle(){if(f.id===1)return {data:{id:1,visitante_id:'paciente',status:'agendado',atendido_em:'2030-01-01T13:00Z',data_avaliacao:'2030-01-01T12:00Z'}};return {data:f.naoNulo==='atendido_em'&&temAnterior?{id:1}:null};},async single(){return {data:{id:2,...inserted}};},then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}};return b;};try{const r=await service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-02T12:00Z',observacao:'Retorno'});assert.equal(r.retorno_de,1);temAnterior=false;await assert.rejects(service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-03T12:00Z',observacao:'Retorno'}),/Não há atendimento concluído/);}finally{db.from=original;}});
