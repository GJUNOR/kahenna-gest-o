// Local fixture only. All records and PDF bytes are synthetic and stored in memory.
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='local-test-only';
const express=require('express'),path=require('node:path'),fs=require('node:fs');
const {preparar,usuario,paciente}=require('./paciente-unificado-fixture.cjs');
(async()=>{const {pg,db,doc,pdf}=await preparar(),app=express();
 const config=require.resolve('../config/supabase');require.cache[config]={id:config,filename:config,loaded:true,exports:db};
 db.storage={from:()=>({download:async chave=>chave===paciente+'/'+doc+'.pdf'?{data:new Blob([pdf])}:{error:new Error('Documento local não encontrado')}})};
 const papel=req=>req.headers.cookie?.includes('preview_role=secretaria')?'secretaria':'administrador';
 app.use(express.json());app.use('/api',(req,res,next)=>{req.usuario={id:usuario,email:'local@example.invalid',app_metadata:{ativo:true,papel:papel(req)}};next();});
 app.get('/api/auth/session',(req,res)=>res.json({usuario:{id:usuario,papel:papel(req)}}));
 app.use('/api/clinica',require('../routes/paciente-unificado')(db));app.use('/api/pacientes',require('../routes/documentos')(db,undefined,{}));app.use('/api/estoque',require('../routes/estoque')(db));app.use('/',require('../routes/leads'));
 app.get('/api/financeiro/movimentacoes-do-dia',(req,res)=>res.json({visitante_ids:[],movimentacoes:[]}));app.use('/api/financeiro',require('../routes/financeiro'));
 app.get('/api/conversoes/resumo',(req,res)=>res.json({receitaHoje:100,receitaMes:100}));app.get('/api/conversoes/paciente/:id',(req,res)=>res.json({data:null}));
 app.get('/api/agendamentos/hoje',(req,res)=>res.json({data:[],total:0}));
 app.get('/api/agendamentos',async(req,res)=>{const r=await pg.query("select a.*,jsonb_build_object('nome',v.nome,'telefone',v.telefone,'visitante_id',v.visitante_id) paciente from agendamentos a join visitantes v on v.visitante_id=a.visitante_id where ($1::timestamptz is null or a.data_avaliacao >= $1) and ($2::timestamptz is null or a.data_avaliacao < $2) order by a.data_avaliacao",[req.query.inicio||null,req.query.fim||null]);res.json({data:r.rows});});
 const {renderizarPagina,PAGINAS,enviarPagina}=require('../middleware/paginas');for(const p of PAGINAS)app.get('/'+p,(req,res)=>{let role=papel(req);if(['secretaria','administrador'].includes(req.query.papel)){role=req.query.papel;res.cookie('preview_role',role,{httpOnly:true,sameSite:'lax'});}if(role==='secretaria'&&['estoque.html','configuracoes.html'].includes(p))return res.redirect('/dashboard.html');if(req.query.estrutura==='1'||req.get('sec-fetch-dest')==='iframe'){req.usuario={app_metadata:{papel:role}};return enviarPagina(req,res,p);}res.type('html').send(renderizarPagina(fs.readFileSync(path.join(__dirname,'../public',p),'utf8'),role,p));});
 for(const pasta of ['build','standard_fonts','wasm','cmaps'])app.use('/assets/pdfjs/'+pasta,express.static(path.join(__dirname,'../node_modules/pdfjs-dist',pasta),{index:false}));
 app.use(express.static(path.join(__dirname,'../public')));app.use((e,req,res,next)=>res.status(e.statusCode||500).json({mensagem:e.message}));app.listen(3103,'127.0.0.1',()=>console.log('Ficha fictícia local: http://127.0.0.1:3103/leads.html'));
})().catch(e=>{console.error(e);process.exitCode=1;});
