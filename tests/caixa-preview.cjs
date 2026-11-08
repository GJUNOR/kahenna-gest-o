'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='local-test-only';
const express=require('express'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {preparar,adapter,usuario,paciente}=require('./caixa-local-db.cjs');
async function iniciar(){
 const pg=await preparar(),db=adapter(pg),app=express();app.use(express.json());
 app.get('/api/auth/session',(q,r)=>r.json({usuario:{id:usuario,papel:'administrador'}}));
 const auth=(q,r,next)=>{q.usuario={id:usuario};next();};
 app.use('/api/caixa',require('../routes/caixa')(db,auth));
 app.use('/api/estoque',require('../routes/estoque')(db,auth));
 app.get('/api/financeiro/taxas-cartao',async(q,r)=>r.json(await require('../services/caixa').criarServico(db).taxas()));
 app.get('/api/financeiro/paciente/:id',async(q,r)=>r.json({lancamentos:(await pg.query('select * from lancamentos_financeiros where visitante_id=$1',[q.params.id])).rows,total:0}));
 app.post('/api/financeiro/paciente/:id',async(q,r)=>{try{r.json({dados:(await pg.query('select kahenna_registrar_financeiro($1,$2::jsonb,$3,$4) r',[q.params.id,JSON.stringify(q.body),usuario,q.body.operacao_id])).rows[0].r});}catch(e){r.status(400).json({mensagem:e.message});}});
 app.get('/api/visitantes',(q,r)=>r.json([]));app.get('/api/leads',(q,r)=>r.json([]));
 app.get('/api/*rest',(q,r)=>r.json({sucesso:true,dados:[],lancamentos:[],pacientes:[],agendamentos:[]}));
 const {renderizarPagina,PAGINAS}=require('../middleware/paginas');
 for(const p of PAGINAS)app.get('/'+p,(req,res)=>res.type('html').send(renderizarPagina(fs.readFileSync(path.join(__dirname,p==='estoque.html'&&req.query.novo_atendimento==='1'?'../views/estoque-materiais.html':'../public/'+p),'utf8'),'administrador',p)));
 app.use(express.static(path.join(__dirname,'../public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 return {url:'http://127.0.0.1:'+server.address().port,pg,paciente,usuario,async fechar(){server.closeAllConnections();await new Promise(r=>server.close(r));await pg.close();}};
}
module.exports={iniciar};
if(require.main===module)iniciar().then(s=>console.log(s.url)).catch(console.error);
