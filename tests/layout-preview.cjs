// Synthetic visual QA for the five pages. Never imported by the production server.
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const express=require('express'),path=require('node:path'),app=express();const {enviarPagina}=require('../middleware/paginas');
app.use(express.json());app.use((req,res,next)=>{req.usuario={id:'33333333-3333-4333-8333-333333333333',app_metadata:{ativo:true,papel:'administrador'}};next();});
app.get('/api/auth/session',(req,res)=>res.json({usuario:{papel:'administrador'}}));
app.get('/api/leads',(req,res)=>res.json([{visitante_id:'11111111-1111-4111-8111-111111111111',nome:'Paciente de demonstração',telefone:'00000000000',status:'novo',criado_em:new Date().toISOString()}]));
app.get('/api/agendamentos',(req,res)=>res.json([]));app.get('/api/conversoes/resumo',(req,res)=>res.json({receitaHoje:0,receitaMes:0}));
app.get('/api/equipe',(req,res)=>res.json({data:[{id:'33333333-3333-4333-8333-333333333333',nome:'Equipe de demonstração',email:'demo@example.invalid',ativo:true,papel:'administrador',ultimo_acesso:new Date().toISOString()}]}));
app.get('/api/financeiro/*path',(req,res)=>res.json([]));
app.get('/api/estoque/painel',async(req,res)=>{try{const r=await fetch('http://127.0.0.1:3102'+req.originalUrl);res.status(r.status).json(await r.json());}catch{res.status(503).json({mensagem:'Inicie também estoque-preview.cjs na porta 3102.'});}});
app.get(/^\/(dashboard|leads|agenda|estoque|configuracoes)\.html$/,(req,res)=>enviarPagina(req,res,req.params[0]+'.html'));
app.use(express.static(path.join(__dirname,'../public')));app.listen(3103,'127.0.0.1',()=>console.log('Prévia integrada e fictícia: http://127.0.0.1:3103/dashboard.html'));
