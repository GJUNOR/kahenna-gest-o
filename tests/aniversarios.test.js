'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hojeBrasil,normalizarNascimento,aniversariantesHoje,linkParabens}=require('../public/aniversarios');
const agora=new Date('2026-10-26T03:30:00Z');
test('nascimento opcional; calendário real, bissexto e data futura',()=>{
 for(const v of ['',null,undefined])assert.equal(normalizarNascimento(v,agora),null);
 assert.equal(normalizarNascimento('2000-02-29',agora),'2000-02-29');
 for(const v of ['2001-02-29','2026-02-30','2026-10-27','1899-12-31','26/10/2000','2000-01-01T00:00:00Z',{},20261026])assert.throws(()=>normalizarNascimento(v,agora),{statusCode:400});
});
test('aniversário usa dia e mês e fuso brasileiro, sem idade',()=>{
 assert.equal(hojeBrasil(new Date('2026-10-26T02:59:00Z')),'2026-10-25');
 assert.equal(hojeBrasil(new Date('2026-10-26T03:00:00Z')),'2026-10-26');
 const ps=[{nome:'Z',data_nascimento:'1990-10-26'},{nome:'A',data_nascimento:'2001-10-26'},{nome:'Ontem',data_nascimento:'1990-10-25'},{nome:'Sem data'},{data_nascimento:'invalida'}];
 assert.deepEqual(aniversariantesHoje(ps,agora).map(p=>p.nome),['A','Z']);
 assert.equal(aniversariantesHoje([{data_nascimento:'2000-02-29'}],new Date('2027-02-28T12:00:00Z')).length,0);
 assert.equal(aniversariantesHoje([{data_nascimento:'2000-02-29'}],new Date('2028-02-29T12:00:00Z')).length,1);
});
test('WhatsApp prepara mensagem codificada e recusa telefone inválido',()=>{
 const url=new URL(linkParabens({nome:'Ana <Teste>',telefone:'(62) 99999-0000'}));
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/5562999990000');
 assert.match(url.searchParams.get('text'),/Olá, Ana! Feliz aniversário/);
 assert.equal(linkParabens({telefone:'00000000000'}),null);
 assert.equal(linkParabens({telefone:'123'}),null);
 assert.equal(new URL(linkParabens({telefone:'5562999990000'})).pathname,'/5562999990000');
});
test('serviço salva/remove nascimento e omissão preserva data existente',async()=>{
 const config=require.resolve('../config/supabase');let last;
 const client={from(){return {insert(record){last=record;return this;},update(record){last=record;return this;},eq(){return this;},select(){return this;},async single(){return {data:last};},async maybeSingle(){return {data:last};}};}};
 require.cache[config]={id:config,filename:config,loaded:true,exports:client};
 const svc=require('../services/visitantes');
 await svc.criarVisitante({nome:'Ficticio',telefone:'00000000000',data_nascimento:'2000-10-26'});assert.equal(last.data_nascimento,'2000-10-26');
 await svc.atualizarVisitante('teste',{data_nascimento:''});assert.equal(last.data_nascimento,null);
 await svc.atualizarVisitante('teste',{nome:'Novo nome'});assert.equal(Object.hasOwn(last,'data_nascimento'),false);
 await assert.rejects(svc.atualizarVisitante('teste',{data_nascimento:'2001-02-29'}),{statusCode:400});
});
