'use strict';process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{randomUUID}=require('node:crypto');
const {preparar,usuario,paciente,outro}=require('./paciente-unificado-fixture.cjs');
const admin={id:usuario,app_metadata:{ativo:true,papel:'administrador'}},secretaria={id:usuario,app_metadata:{ativo:true,papel:'secretaria'}};
test('ficha, busca e duplicidade: PostgreSQL real, seções por paciente, permissões e auditoria',async()=>{const {pg,db}=await preparar(),s=require('../services/paciente-unificado').criarServico(db);try{
 const resumo=await s.resumo(paciente,admin);assert.equal(Number(resumo.recebido),100);assert.equal(resumo.contagens.documentos,1);assert.equal(resumo.contagens.materiais,1);
 const restrito=await s.resumo(paciente,secretaria);assert.equal(restrito.contagens.documentos,null);assert.equal(restrito.contagens.materiais,null);assert.equal(restrito.permissoes.documentos,false);
 for(const sec of ['atendimentos','financeiro','materiais','documentos'])assert.equal((await s.secao(paciente,sec,0,admin)).total,1);
 for(const sec of ['materiais','documentos'])await assert.rejects(s.secao(paciente,sec,0,secretaria),{statusCode:403});
 assert.equal((await s.secao(outro,'financeiro',0,admin)).total,0);await assert.rejects(s.resumo(randomUUID(),admin),{statusCode:404});
 const porNome=await s.buscar('sao jose',0,admin);assert.equal(porNome.grupos.pacientes[0].id,paciente);assert.equal(porNome.grupos.agenda[0].paciente_id,paciente);
 assert.equal((await s.buscar('6298888',0,admin)).grupos.pacientes[0].id,paciente);
 const porLote=await s.buscar('LOCAL-2026',0,admin);assert.equal(porLote.grupos.lotes.length,1);
 const porDoc=await s.buscar('Prontuario',0,admin);assert.equal(porDoc.grupos.documentos.length,1);
 assert.equal((await s.buscar('Prontuario',0,secretaria)).grupos.documentos.length,0);assert.equal((await s.buscar('Gaze',0,secretaria)).grupos.produtos.length,0);
 assert.ok(Number((await pg.query('select count(*) as n from documentos_auditoria')).rows[0].n)>=2);
 const d=await s.duplicados({nome:'ANA SAO JOSE LOCAL',telefone:'+55 (62) 98888-0000'});assert.equal(d.total,1);assert.ok(d.itens[0].motivos.includes('Mesmo telefone'));assert.ok(d.itens[0].motivos.includes('Mesmo nome'));
 assert.equal((await s.duplicados({nome:'ANA SAO JOSE LOCAL',telefone:'5562988880000',ignorar:paciente})).total,0);
 await assert.rejects(s.verificarCadastro({nome:'ANA SAO JOSE LOCAL',telefone:'62988880000'}),e=>e.statusCode===409&&e.codigo==='POSSIVEL_DUPLICADO');
 const confirmado=await s.duplicados({nome:'ANA SAO JOSE LOCAL',telefone:'62988880000'});await s.verificarCadastro({nome:'ANA SAO JOSE LOCAL',telefone:'62988880000',confirmacao_duplicado:confirmado.confirmacao});
 await assert.rejects(s.verificarCadastro({nome:'Nome diferente',telefone:'62988880000',confirmacao_duplicado:confirmado.confirmacao}),{statusCode:409});
 await s.verificarCadastro({nome:'Ana São José — LOCAL',telefone:'62988880000'},paciente);
 await pg.exec('reset role');for(const role of ['anon','authenticated']){await pg.exec('set role '+role);for(const table of ['visitantes','documentos_pacientes','estoque_atendimentos'])await assert.rejects(pg.query('select * from '+table+' limit 1'),/permission denied/);await pg.exec('reset role');}
 }finally{await pg.close();}});
test('rotas da ficha e busca recusam sessão ausente, inativa e parâmetros de permissão forjados',async()=>{let chamadas=[];const db={from(n){chamadas.push(n);return {select(){return this;},order(){return this;},async range(){return {data:[]};}};}};const app=express();app.use(express.json());app.use((req,res,next)=>{const role=req.get('x-role');if(role)req.usuario={id:usuario,app_metadata:{papel:role,ativo:role!=='inativo'}};next();});app.use('/api/clinica',require('../routes/paciente-unificado')(db));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/clinica';try{
 const buscar=role=>fetch(url+'/busca',{method:'POST',headers:{'Content-Type':'application/json',...(role?{'x-role':role}:{})},body:JSON.stringify({q:'teste',p_admin:true})});
 for(const role of [null,'inativo','estranho']){const r=await buscar(role);assert.equal(r.status,401);}assert.equal(chamadas.length,0);
 assert.equal((await fetch(url+'/pacientes/'+paciente+'/documentos?p_admin=true',{headers:{'x-role':'secretaria'}})).status,403);assert.equal(chamadas.length,0);
 assert.equal((await buscar('secretaria')).status,200);assert.deepEqual(chamadas.sort(),['agendamentos','visitantes']);
 assert.equal((await fetch(url+'/pacientes/invalido',{headers:{'x-role':'administrador'}})).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}});
