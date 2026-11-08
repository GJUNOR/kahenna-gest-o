'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='local-test-only';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
test('rotas novas: recusam sessão ausente, secretária e usuário inativo antes de consultar dados',async()=>{
 const app=express();app.use(express.json());app.use((q,r,next)=>{if(q.get('x-role'))q.usuario={id:'33333333-3333-4333-8333-333333333333',app_metadata:{papel:q.get('x-role'),ativo:q.get('x-ativo')!=='false'}};next();});
 const db={from(){throw Error('Não deveria consultar o banco.');},rpc(){throw Error('Não deveria alterar o banco.');}};
 app.use('/api/orcamentos',require('../routes/orcamentos')(db));
 app.use('/api/estetica',require('../routes/estetica')(db));app.use('/api/organizacao',require('../routes/organizacao')(db));app.use('/api/caixa',require('../routes/caixa')(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{const url='http://127.0.0.1:'+server.address().port;
 for(const headers of [{},{'x-role':'secretaria'},{'x-role':'administrador','x-ativo':'false'}])for(const [method,path] of [['GET','/api/orcamentos'],['POST','/api/orcamentos'],['GET','/api/orcamentos/catalogo'],['POST','/api/orcamentos/catalogo'],['POST','/api/orcamentos/receber'],['GET','/api/organizacao/fornecedores'],['POST','/api/organizacao/fornecedores'],['GET','/api/organizacao/arquivos'],['POST','/api/organizacao/arquivos'],['GET','/api/organizacao/arquivos/11111111-1111-4111-8111-111111111111/baixar'],['GET','/api/estetica/pacientes/11111111-1111-4111-8111-111111111111'],['POST','/api/estetica/pacientes/11111111-1111-4111-8111-111111111111/planos'],['POST','/api/estetica/pacientes/11111111-1111-4111-8111-111111111111/fotos'],['POST','/api/caixa/importar-nota']]){const r=await fetch(url+path,{method,headers});assert([401,403].includes(r.status),path+' '+r.status);}
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
