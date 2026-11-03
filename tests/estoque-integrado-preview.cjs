process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='local-test-only';
const express=require('express'),path=require('node:path'),{randomUUID}=require('node:crypto'),{preparar,adapter,usuario}=require('./estoque-local-db.cjs');
(async()=>{const pg=await preparar(),db=adapter(pg),svc=require('../services/estoque-avancado').criarServico(db),hoje=require('../public/aniversarios').hojeBrasil();
 for(const [nome,q,total] of [['Agulhas locais',50,25],['Luvas locais',200,80]])await svc.salvar({id:randomUUID(),produto_id:randomUUID(),novo:true,cadastro:{nome,categoria:'Materiais',unidade:'un',estoque_minimo:10},compra:{quantidade:q,unidade_compra:'un',valor_total:total,ocorrido_em:hoje}}, {id:usuario});
 const app=express();app.use(express.json());app.get('/api/auth/session',(req,res)=>res.json({usuario:{id:usuario,papel:'administrador'}}));app.use('/api/estoque',require('../routes/estoque')(db,(req,res,next)=>{req.usuario={id:usuario};next();}));
 const {renderizarPagina,PAGINAS}=require('../middleware/paginas'),fs=require('node:fs');for(const p of PAGINAS)app.get('/'+p,(req,res)=>res.type('html').send(renderizarPagina(fs.readFileSync(path.join(__dirname,'../public',p),'utf8'),'administrador',p)));
 app.use(express.static(path.join(__dirname,'../public')));app.listen(3102,'127.0.0.1',()=>console.log('Estoque PostgreSQL local em http://127.0.0.1:3102/estoque.html'));
})().catch(e=>{console.error(e);process.exitCode=1;});
