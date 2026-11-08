'use strict';
require('dotenv').config();
const express=require('express');
const path=require('path');
const {enviarPagina}=require('./middleware/paginas');
const {exigirAutenticacaoApi,exigirAutenticacaoPagina,exigirAdministradorApi,exigirAdministradorPagina}=require('./middleware/auth');
const app=express();
app.disable('x-powered-by');app.set('trust proxy',1);
app.use(express.json({limit:'1mb'}));app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin'});if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin){const host=`${req.protocol}://${req.get('host')}`;const allowed=(process.env.ALLOWED_ORIGINS||host).split(',').map(x=>x.trim());if(!allowed.includes(req.headers.origin))return res.status(403).json({sucesso:false,mensagem:'Origem não autorizada.'});}next();});
app.get('/health',(req,res)=>res.json({sucesso:true,servidor:'online'}));
app.use('/api/auth',require('./routes/auth'));
app.get('/',(req,res)=>res.redirect('/agenda.html'));
app.get(['/dashboard','/agenda','/pacientes'],(req,res)=>res.redirect({'/dashboard':'/dashboard.html','/agenda':'/agenda.html','/pacientes':'/leads.html'}[req.path]));
app.get('/estoque',exigirAdministradorPagina,(req,res)=>res.redirect('/estoque.html'));
app.get('/estoque.html',exigirAdministradorPagina,(req,res)=>enviarPagina(req,res,'estoque.html'));
app.get(['/fornecedores.html','/arquivos.html','/orcamentos.html'],exigirAdministradorPagina,(req,res)=>enviarPagina(req,res,req.path.slice(1)));
app.get('/configuracoes.html',exigirAdministradorPagina,(req,res)=>enviarPagina(req,res,'configuracoes.html'));
app.get(['/dashboard.html','/agenda.html','/leads.html'],exigirAutenticacaoPagina,(req,res)=>enviarPagina(req,res,req.path.slice(1).toLowerCase()));
app.use('/api',exigirAutenticacaoApi);
app.use('/api/turnos-clinica',require('./routes/turnos-clinica')(require('./config/supabase')));
app.use('/api/clinica',require('./routes/paciente-unificado')(require('./config/supabase')));
app.use('/api/pacientes',require('./routes/documentos')(require('./config/supabase')));
app.use('/',require('./routes/leads'));
app.use('/',require('./routes/agendamentos'));
app.use('/api/conversoes',require('./routes/conversoes'));
app.use('/api/financeiro',require('./routes/financeiro'));
app.use('/api/estoque',require('./routes/estoque')(require('./config/supabase')));
app.use('/api/caixa',require('./routes/caixa')(require('./config/supabase')));
app.use('/api/orcamentos',require('./routes/orcamentos')(require('./config/supabase')));
app.use('/api/organizacao',require('./routes/organizacao')(require('./config/supabase')));
app.use('/api/estetica',require('./routes/estetica')(require('./config/supabase')));
app.use('/assets/ocr',express.static(path.join(__dirname,'node_modules/tesseract.js/dist'),{index:false}));
app.use('/assets/ocr-core',express.static(path.join(__dirname,'node_modules/tesseract.js-core'),{index:false}));
app.use('/assets/ocr-lang',express.static(path.join(__dirname,'node_modules/@tesseract.js-data/por/4.0.0_best_int'),{index:false}));
app.use('/api/equipe',exigirAdministradorApi,require('./routes/equipe'));
for (const pasta of ['build','standard_fonts','wasm','cmaps']) app.use('/assets/pdfjs/'+pasta,express.static(path.join(__dirname,'node_modules/pdfjs-dist',pasta),{index:false}));
app.use(express.static(path.join(__dirname,'public'),{
    index:false,
    setHeaders(res,arquivo){
        const versao=res.req.query.v;
        if (/\.(?:css|js)$/i.test(arquivo) && typeof versao==='string' && /^\d+$/.test(versao)) {
            res.setHeader('Cache-Control','private, max-age=3600');
        }
    }
}));
app.use((req,res)=>res.status(404).json({sucesso:false,mensagem:'Página não encontrada.'}));
app.use((err,req,res,next)=>{console.error('Falha na plataforma:',err.message);res.status(err.statusCode||500).json({sucesso:false,mensagem:process.env.NODE_ENV==='production'?'Não foi possível concluir. Tente novamente.':err.message});});
if(require.main===module)app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Kahenna Gestão: servidor iniciado.'));
module.exports=app;
