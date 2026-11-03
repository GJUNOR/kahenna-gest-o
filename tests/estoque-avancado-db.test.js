'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const usuario=randomUUID(),paciente=randomUUID(),hoje=require('../public/aniversarios').hojeBrasil();
const migration='20261103023124_estoque_compras_lotes_atendimentos.sql';
test('estoque completo: compra total, embalagens, validade, lista por paciente e baixa atômica',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.visitantes(visitante_id uuid primary key,nome text);grant usage on schema public,auth to service_role;grant select,update on public.visitantes to service_role;');
  await db.query('insert into auth.users(id) values($1)',[usuario]);await db.query("insert into visitantes values($1,'Paciente local fictício')",[paciente]);
  for(const f of ['20261026130322_estoque.sql','20261103013557_estoque_exclusao_recuperavel.sql','20261103015409_estoque_recriar_produto_excluido.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
  // A real-shaped pre-migration balance and ledger must retain their original units.
  const antigo=randomUUID();await db.query("insert into estoque_produtos(id,nome,unidade) values($1,'Caixas antigas','caixa')",[antigo]);
  await db.query("select kahenna_movimentar_estoque($1,$2,'entrada',6,20,$3,'Saldo anterior','',$4)",[randomUUID(),antigo,hoje,usuario]);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
  await db.exec('set role service_role');
  let old=(await db.query('select quantidade::float as q,valor_estoque::float as v from estoque_produtos where id=$1',[antigo])).rows[0];assert.deepEqual(old,{q:6,v:120});
  assert.equal((await db.query('select sum(quantidade_restante)::float as q from estoque_lotes where produto_id=$1',[antigo])).rows[0].q,6);
  const produto=randomUUID(),op=randomUUID();
  const cadastro={cadastro:{nome:'Luvas novas',categoria:'Descartáveis',unidade:'un',estoque_minimo:10},compra:{modo:'novo',tipo:'entrada',quantidade:2,unidade_compra:'caixa',conteudo_embalagem:100,valor_total:80,custo_unitario:null,lote:null,validade:null,ocorrido_em:hoje,motivo:'Compra',fornecedor:''},conversao:null};
  const salvar=(d=cadastro,id=op,prod=produto,novo=true)=>db.query('select kahenna_salvar_produto_estoque($1,$2,$3,$4::jsonb,$5) as r',[id,prod,novo,JSON.stringify(d),usuario]);
  let r=(await salvar()).rows[0].r;assert.equal(Number(r.produto.quantidade),200);assert.equal(Number(r.produto.custo_medio),.4);assert.equal(Number(r.movimento.valor_total),80);
  await salvar();assert.equal((await db.query('select count(*)::int as n from estoque_movimentos where produto_id=$1',[produto])).rows[0].n,1);
  await assert.rejects(salvar({...cadastro,compra:{...cadastro.compra,valor_total:81}}),/outros dados/);
  // Invalid initial purchase rolls the product back too.
  const invalido=randomUUID();await assert.rejects(salvar({...cadastro,cadastro:{...cadastro.cadastro,nome:'Não deve existir'},compra:{...cadastro.compra,valor_total:80,custo_unitario:1}},randomUUID(),invalido),/valor total/);
  assert.equal((await db.query('select count(*)::int as n from estoque_produtos where id=$1',[invalido])).rows[0].n,0);
  // Precision: R$10 / 3 is kept as exact total, without inventing four-decimal cost.
  const fracionado=randomUUID();r=(await salvar({...cadastro,cadastro:{...cadastro.cadastro,nome:'Custo periódico'},compra:{...cadastro.compra,quantidade:3,unidade_compra:'un',conteudo_embalagem:1,valor_total:10}},randomUUID(),fracionado)).rows[0].r;
  assert.equal(Number(r.produto.valor_estoque),10);assert.ok(Number(r.produto.custo_medio)>3.3333);
  // Conversion is explicit, preserves value and original ledger unit, and is idempotent.
  const conv=randomUUID();await db.query("select kahenna_converter_embalagem($1,$2,'un',100,0,$3)",[conv,antigo,usuario]);await db.query("select kahenna_converter_embalagem($1,$2,'un',100,0,$3)",[conv,antigo,usuario]);
  old=(await db.query('select quantidade::float as q,valor_estoque::float as v from estoque_produtos where id=$1',[antigo])).rows[0];assert.deepEqual(old,{q:600,v:120});
  assert.equal((await db.query('select unidade_registro from estoque_movimentos where produto_id=$1',[antigo])).rows[0].unidade_registro,'caixa');
  // Manual changes to the reusable patient list have no stock side effect.
  await db.query('select kahenna_salvar_lista_materiais($1,$2::jsonb,$3)',[paciente,JSON.stringify([{produto_id:produto,quantidade:2}]),usuario]);
  const q=async id=>Number((await db.query('select quantidade from estoque_produtos where id=$1',[id])).rows[0].quantidade);
  const rev=async id=>Number((await db.query('select revisao from estoque_produtos where id=$1',[id])).rows[0].revisao);
  assert.equal(await q(produto),200);
  const a=randomUUID(),itens=[{produto_id:produto,quantidade:3,revisao:await rev(produto),lote_id:null},{produto_id:antigo,quantidade:2,revisao:await rev(antigo),lote_id:null}];
  const atender=(items=itens,id=a,save=true)=>db.query('select kahenna_registrar_materiais_atendimento($1,$2,$3,$4,$5::jsonb,$6,$7) as r',[id,paciente,'Atendimento fictício',hoje,JSON.stringify(items),save,usuario]);
  r=(await atender()).rows[0].r;assert.equal(Number(r.atendimento.custo_total),1.6);assert.equal(await q(produto),197);assert.equal(await q(antigo),598);
  await atender();assert.equal(await q(produto),197);assert.equal((await db.query('select count(*)::int as n from estoque_atendimentos')).rows[0].n,1);
  assert.equal(Number((await db.query('select itens from estoque_listas_pacientes where paciente_id=$1',[paciente])).rows[0].itens[0].quantidade),3);
  const estadoAntes=await q(produto);await assert.rejects(atender([{produto_id:produto,quantidade:1,revisao:await rev(produto),lote_id:null},{produto_id:antigo,quantidade:9999,revisao:await rev(antigo),lote_id:null}],randomUUID()),/Saldo insuficiente/);assert.equal(await q(produto),estadoAntes);
  await assert.rejects(atender([{produto_id:produto,quantidade:1,revisao:0,lote_id:null}],randomUUID()),/estoque foi atualizado/);
  // An expired batch cannot be used on a patient, but can be discarded explicitly.
  const vencido=randomUUID();await salvar({...cadastro,cadastro:{...cadastro.cadastro,nome:'Lote vencido'},compra:{...cadastro.compra,quantidade:5,unidade_compra:'un',conteudo_embalagem:1,valor_total:10,lote:'VENCIDO',validade:'2020-01-01'}},randomUUID(),vencido);
  await assert.rejects(atender([{produto_id:vencido,quantidade:1,revisao:await rev(vencido),lote_id:null}],randomUUID()),/lotes válidos/);
  const descarte={modo:'novo',tipo:'saida',quantidade:1,revisao:await rev(vencido),ocorrido_em:hoje,motivo:'Descarte',fornecedor:'',finalidade:'descarte'};
  await db.query('select kahenna_movimentar_estoque_v2($1,$2,$3::jsonb,$4)',[randomUUID(),vencido,JSON.stringify(descarte),usuario]);assert.equal(await q(vencido),4);
  // New legacy API calls also allocate batches; no stale open tab can desynchronize stock.
  await db.query("select kahenna_movimentar_estoque($1,$2,'saida',1,null,$3,'Legado','',$4)",[randomUUID(),produto,hoje,usuario]);
  assert.equal(Number((await db.query('select sum(quantidade_restante) as q from estoque_lotes where produto_id=$1',[produto])).rows[0].q),await q(produto));
  // FEFO uses the earlier valid batch first, independent of insertion order.
  const fefo=randomUUID(),loteA=randomUUID(),loteB=randomUUID();
  await salvar({...cadastro,cadastro:{...cadastro.cadastro,nome:'FEFO local'},compra:{...cadastro.compra,quantidade:2,unidade_compra:'un',conteudo_embalagem:1,valor_total:2,lote:'A',validade:'2030-01-01'}},loteA,fefo);
  await salvar({cadastro:{nome:'FEFO local',categoria:'Descartáveis',unidade:'un',estoque_minimo:10},revisao:await rev(fefo),conversao:null,compra:{...cadastro.compra,quantidade:2,unidade_compra:'un',conteudo_embalagem:1,valor_total:2,lote:'B',validade:'2029-01-01'}},loteB,fefo,false);
  await atender([{produto_id:fefo,quantidade:3,revisao:await rev(fefo),lote_id:null}],randomUUID());
  assert.equal(Number((await db.query('select quantidade_restante from estoque_lotes where id=$1',[loteB])).rows[0].quantidade_restante),0);
  assert.equal(Number((await db.query('select quantidade_restante from estoque_lotes where id=$1',[loteA])).rows[0].quantidade_restante),1);
  // Optional manual cost is sufficient; the saved total remains rounded to cents.
  const manual=randomUUID();await salvar({...cadastro,cadastro:{...cadastro.cadastro,nome:'Custo manual'},compra:{...cadastro.compra,quantidade:3,unidade_compra:'un',conteudo_embalagem:1,valor_total:null,custo_unitario:.33333333}},randomUUID(),manual);
  assert.equal(Number((await db.query('select valor_estoque from estoque_produtos where id=$1',[manual])).rows[0].valor_estoque),1);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role');await db.exec('set role '+role);
   await assert.rejects(db.query('select * from estoque_lotes'),/permission denied/);
   await assert.rejects(db.query('select * from estoque_listas_pacientes'),/permission denied/);
   await assert.rejects(db.query('select kahenna_registrar_materiais_atendimento($1,$2,$3,$4,$5::jsonb,true,$6)',[randomUUID(),paciente,'Teste',hoje,JSON.stringify(itens),usuario]),/permission denied/);
  }
 }finally{await db.close();}
});
