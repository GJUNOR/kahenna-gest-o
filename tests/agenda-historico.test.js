'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict');
const db=require('../config/supabase'),service=require('../services/agendamentos');
test('agenda: nova visita insere registro; reagendamento exige ID e paciente corretos',async()=>{
 const original=db.from;let inserts=0,updates=0;const historico={id:4,visitante_id:'paciente',data_avaliacao:'2020-01-01T12:00:00Z',status:'realizado'};
 db.from=table=>{let mode='select';const filters={};const b={select(){return b;},eq(k,v){filters[k]=v;return b;},neq(){return b;},limit(){return b;},update(){mode='update';return b;},insert(){inserts++;return b;},async maybeSingle(){return {data:filters.status==='agendado'?null:historico};},async single(){if(mode==='update')updates++;return {data:{id:10}};},then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}};return b;};
 try{await service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-01T12:00:00Z'});assert.equal(inserts,1);assert.equal(updates,0);assert.equal(historico.status,'realizado');await assert.rejects(service.criarOuAtualizarAgendamento({visitanteId:'paciente',dataAvaliacao:'2030-01-01T12:00:00Z',agendamentoId:4}),{statusCode:409});assert.equal(updates,0);}finally{db.from=original;}
});
