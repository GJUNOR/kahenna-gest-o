'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {produto,movimento,periodo}=require('../services/estoque');
const id='11111111-1111-4111-8111-111111111111',uid='33333333-3333-4333-8333-333333333333';
const data={id,produto_id:id,tipo:'entrada',quantidade:'10.125',custo_unitario:'2.5025',ocorrido_em:'2026-01-01',motivo:'Compra',fornecedor:'Loja'};
test('estoque: produto permite somente campos editáveis e valores válidos',()=>{
 const p=produto({nome:' Luvas ',categoria:' Descartáveis ',unidade:'caixa',estoque_minimo:'2.5',quantidade:100,valor_estoque:1,ativo:false});
 assert.deepEqual(p,{nome:'Luvas',categoria:'Descartáveis',unidade:'caixa',estoque_minimo:2.5});
 assert.throws(()=>produto({...p,unidade:'litros'}),{statusCode:400});
 assert.throws(()=>produto({...p,nome:''}),{statusCode:400});
 for(const v of [-1,'NaN','1e8','1.0001',1000000])assert.throws(()=>produto({...p,estoque_minimo:v}),{statusCode:400});
 assert.equal(Object.hasOwn(produto({...p,unidade:'ml'},true),'unidade'),false);
});
test('estoque: movimento usa responsável da sessão e custo da saída é calculado no banco',()=>{
 const m=movimento({...data,p_usuario:'malicioso'},{id:uid});assert.equal(m.p_usuario,uid);assert.equal(m.p_quantidade,10.125);assert.equal(m.p_custo,2.5025);
 assert.equal(movimento({...data,tipo:'saida',custo_unitario:99999},{id:uid}).p_custo,null);
 for(const change of [{id:'x'},{produto_id:'x'},{quantidade:0},{quantidade:-1},{quantidade:'1.0001'},{custo_unitario:'2.12345'},{tipo:'ajuste'},{ocorrido_em:'2026-02-30'},{ocorrido_em:'2099-01-01'}])assert.throws(()=>movimento({...data,...change},{id:uid}),{statusCode:400});
 assert.deepEqual(periodo('2026-12'),{inicio:'2026-12-01',fim:'2027-01-01'});assert.throws(()=>periodo('2026-13'),{statusCode:400});
});
test('estoque: rotas exigem administrador ativo e preservam idempotência no RPC',async()=>{
 let args,called=0;const db={async rpc(nome,p){called++;args=p;return {data:{id:p.p_id,saldo_apos:10}};}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{const papel=req.get('x-test-role');if(papel)req.usuario={id:uid,app_metadata:{papel,ativo:papel!=='inativo'}};next();});app.use('/api/estoque',require('../routes/estoque')(db));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/estoque/movimentos`;
 try{for(const [role,status] of [[null,401],['secretaria',403],['inativo',401]]){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(role?{'x-test-role':role}:{})},body:JSON.stringify(data)});assert.equal(r.status,status);}assert.equal(called,0);
 const options={method:'POST',headers:{'Content-Type':'application/json','x-test-role':'administrador'},body:JSON.stringify(data)};assert.equal((await fetch(url,options)).status,201);assert.equal(args.p_id,id);assert.equal(args.p_usuario,uid);assert.equal((await fetch(url,{...options,body:JSON.stringify({...data,quantidade:0})})).status,400);assert.equal(called,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
