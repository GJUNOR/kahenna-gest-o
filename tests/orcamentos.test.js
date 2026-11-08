'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{preparar,usuario,paciente}=require('./novidades-local-db.cjs');
test('Orçamento: preços confirmados, ml, pagamento dividido, taxas, atomicidade e conclusão sem duplicar',async()=>{
 const {pg,db}=await preparar(),u={id:usuario,email:'teste@example.invalid'};try{
 const s=require('../services/orcamentos').criarServico(db),catalogo=await s.catalogo();assert.deepEqual(catalogo.map(i=>[i.nome,Number(i.valor)]).sort(),[['Preenchimento de nariz',750],['Preenchimento labial',550],['Toxina botulínica',750]].sort());
 const tox=catalogo.find(i=>i.nome.startsWith('Toxina')),lab=catalogo.find(i=>i.nome==='Preenchimento labial'),nariz=catalogo.find(i=>i.nome==='Preenchimento de nariz');
 const dados={id:randomUUID(),paciente_id:paciente,titulo:'Procedimentos de teste',itens:[{procedimento_id:tox.id,quantidade:1,valor_unitario:1},{procedimento_id:lab.id,quantidade:2},{procedimento_id:nariz.id,quantidade:1}],pagamento:[{forma_pagamento:'pix',valor:300},{forma_pagamento:'credito',valor:2300,parcelas:6,canal_pagamento:'maquininha',bandeira:'visa'}]};
 await assert.rejects(s.salvar({...dados,id:randomUUID(),itens:[{procedimento_id:lab.id,quantidade:1.5}]},u),/quantidade/);
 let salvo=await s.salvar(dados,u);assert.equal(Number(salvo.total),2600);assert.equal(Number(salvo.itens[0].valor_unitario),750);
 assert.equal((await pg.query('select count(*)::int n from lancamentos_financeiros')).rows[0].n,0);
 await s.salvar(dados,u);const recebido=await s.receber({id:salvo.id,revisao:0},u);await s.receber({id:salvo.id,revisao:0},u);
 assert.equal(Number(recebido.taxa_valor),190.44);assert.equal((await pg.query('select count(*)::int n from lancamentos_financeiros')).rows[0].n,2);assert.equal((await pg.query('select count(*)::int n from orcamento_recebimentos')).rows[0].n,2);
 const fin=(await pg.query('select sum(valor)::numeric bruto,sum(taxa_valor)::numeric taxas,sum(valor-taxa_valor)::numeric liquido from lancamentos_financeiros')).rows[0];assert.equal(Number(fin.bruto),2600);assert.equal(Number(fin.taxas),190.44);assert.equal(Number(fin.liquido),2409.56);
 await assert.rejects(s.salvar({...dados,revisao:1},u),/já foi recebido/);
 await assert.rejects(s.salvar({...dados,id:randomUUID(),pagamento:[{forma_pagamento:'pix',valor:100}]},u),/soma dos pagamentos/);
 await assert.rejects(s.salvar({...dados,id:randomUUID(),pagamento:[{forma_pagamento:'credito',valor:2600,parcelas:7,canal_pagamento:'maquininha',bandeira:'visa'}]},u),/6x/);
 const semTaxa=await s.salvar({...dados,id:randomUUID(),pagamento:[{forma_pagamento:'pix',valor:300},{forma_pagamento:'credito',valor:2300,parcelas:6,canal_pagamento:'maquininha',bandeira:'outras'}]},u);
 await assert.rejects(s.receber({id:semTaxa.id,revisao:0},u),/Cadastre a taxa/);assert.equal((await pg.query('select count(*)::int n from lancamentos_financeiros')).rows[0].n,2);assert.equal((await pg.query('select lancamento_id from orcamentos_pacientes where id=$1',[semTaxa.id])).rows[0].lancamento_id,null);
 const aberto=await s.salvar({...dados,id:randomUUID()},u);await s.preco({...tox,valor:800},u);const novo=await s.salvar({...dados,id:aberto.id,revisao:0,titulo:'Editado'},u);assert.equal(Number(novo.itens[0].valor_unitario),750);
 assert.equal((await pg.query("select has_function_privilege('authenticated','kahenna_receber_orcamento(uuid,integer,uuid,text,text)','EXECUTE') ok")).rows[0].ok,false);
 }finally{await pg.close();}
});

test('Concluir orçamento atende somente a visita atual e não altera agenda sem correspondência única',async()=>{
 const {pg,db}=await preparar(),u={id:usuario,email:'teste@example.invalid'};try{
 const s=require('../services/orcamentos').criarServico(db),p=(await s.catalogo()).find(p=>p.unidade==='procedimento');
 const concluir=async()=>{const o=await s.salvar({id:randomUUID(),paciente_id:paciente,titulo:'Visita local',itens:[{procedimento_id:p.id,quantidade:1}],pagamento:[{forma_pagamento:'pix',valor:750}]},u);await s.receber({id:o.id,revisao:0},u);return o;};
 const atual=(await pg.query("insert into agendamentos(visitante_id,data_avaliacao) values($1,now()) returning id",[paciente])).rows[0].id;
 await pg.query("insert into agendamentos(visitante_id,data_avaliacao,status) values($1,now()-interval '1 day','agendado'),($1,now()+interval '1 hour','agendado'),($1,now()-interval '1 minute','cancelado')",[paciente]);
 const o=await concluir();assert((await pg.query('select atendido_em from agendamentos where id=$1',[atual])).rows[0].atendido_em);
 const stamp=(await pg.query('select atendido_em from agendamentos where id=$1',[atual])).rows[0].atendido_em;await s.receber({id:o.id,revisao:0},u);assert.deepEqual((await pg.query('select atendido_em from agendamentos where id=$1',[atual])).rows[0].atendido_em,stamp);
 assert.equal((await pg.query('select count(*)::int n from agendamentos where atendido_em is not null')).rows[0].n,1);
 await concluir();assert.equal((await pg.query('select count(*)::int n from agendamentos where atendido_em is not null')).rows[0].n,1);
 await pg.query("insert into agendamentos(visitante_id,data_avaliacao) values($1,now()),($1,now()-interval '1 second')",[paciente]);await concluir();assert.equal((await pg.query('select count(*)::int n from agendamentos where atendido_em is not null')).rows[0].n,1);
 }finally{await pg.close();}
});
