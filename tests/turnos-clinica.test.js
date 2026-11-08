'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='local-only';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
test('horários persistem entre telas, auditam alterações e recusam revisão antiga e acesso indevido',async()=>{
 const {pg,db}=await require('./novidades-local-db.cjs').preparar(),usuario=require('./novidades-local-db.cjs').usuario,app=express();app.use(express.json());
 const auth=(q,r,next)=>{const papel=q.get('x-papel');if(!papel)return r.sendStatus(401);q.usuario={id:usuario,app_metadata:{ativo:true,papel}};next();};app.use('/api/turnos-clinica',require('../routes/turnos-clinica')(db,undefined,auth));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/turnos-clinica';
 try{const salvar=(periodo,revisao,papel='administrador',dia='2026-11-21')=>fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','x-papel':papel},body:JSON.stringify({dia,periodo,revisao})});
 assert.equal((await fetch(url)).status,401);assert.equal((await salvar('Vespertino',null,'secretaria')).status,403);assert.equal((await salvar('Vespertino',null,'administrador','2026-02-31')).status,400);
 let r=await salvar('Vespertino',null);assert.equal(r.status,200);assert.equal((await r.json()).turno.revisao,0);r=await salvar('Vespertino',null);assert.equal(r.status,200);assert.equal((await r.json()).turno.revisao,0);
 r=await salvar('Noturno',0);assert.equal((await r.json()).turno.revisao,1);assert.equal((await salvar('Matutino',0)).status,409);
 const leitura=await fetch(url,{headers:{'x-papel':'secretaria'}});assert.equal(leitura.status,200);assert.equal((await leitura.json()).turnos[0].periodo,'Noturno');assert.equal((await pg.query('select count(*)::int n from clinica_acessos')).rows[0].n,2);
 await pg.exec('reset role;set role anon');await assert.rejects(pg.query('select * from clinica_turnos'),/permission denied/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await pg.close();}
});
