'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict');
const authPath=require.resolve('../config/supabaseAuth');require(authPath);
const user={id:'11111111-1111-4111-8111-111111111111',app_metadata:{ativo:true,papel:'administrador'}};
require.cache[authPath].exports=()=>({auth:{async getUser(){return {data:{user}};}}});
const db=require('../config/supabase');
const {sair}=require('../controllers/authController');
test('logout revoga refresh da sessão no Supabase antes de limpar cookies',async()=>{
 const original=db.auth.admin.signOut;let called=false,cleared=0,status;
 db.auth.admin.signOut=async(token,scope)=>{assert.equal(token,'test-access-token');assert.equal(scope,'local');called=true;return {error:null};};
 const res={clearCookie(){cleared++;},status(n){status=n;return this;},json(){return this;}};
 try{await sair({headers:{cookie:'kahenna_access_token=test-access-token'}},res);assert.equal(called,true);assert.equal(cleared,2);assert.equal(status,200);}finally{db.auth.admin.signOut=original;}
});
test('cookie com codificação inválida não derruba a autenticação',async()=>{let status;const res={clearCookie(){},status(n){status=n;return this;},json(){return this;}};await require('../middleware/auth').exigirAutenticacaoApi({headers:{cookie:'kahenna_access_token=%ZZ'}},res,()=>assert.fail('não deve autorizar'));assert.equal(status,401);});
