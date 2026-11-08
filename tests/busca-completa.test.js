'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {preparar,usuario,paciente}=require('./paciente-unificado-fixture.cjs');
test('busca geral encontra os módulos novos sem acentos e preserva as permissões',async()=>{
 const {pg,db}=await preparar();try{
 const arquivo=randomUUID(),fornecedor=randomUUID(),plano=randomUUID(),foto=randomUUID(),orcamento=randomUUID();
 await pg.query("insert into arquivos_clinica(id,titulo,categoria,nome_original,mime,caminho,sha256,tamanho,usuario_id) values($1,'Autorização Full Face','Termos e autorizações','modelo.pdf','application/pdf',$2,'hash',100,$3)",[arquivo,arquivo+'.pdf',usuario]);
 await pg.query("insert into fornecedores_clinica(id,nome,categoria,contato,telefone,usuario_id) values($1,'Brindes São José','Brindes','Maria','62999991234',$2)",[fornecedor,usuario]);
 await pg.query("insert into planos_faciais(id,paciente_id,titulo,data_atendimento,estado,pontos,usuario_id) values($1,$2,'Plano lábios',current_date,'planejado',$3::jsonb,$4)",[plano,paciente,JSON.stringify([{produto:'Ácido Hialurônico',procedimento:'Preenchimento'}]),usuario]);
 await pg.query("insert into fotos_evolucao(id,paciente_id,titulo,data_foto,vista,caminho,sha256,tamanho,usuario_id) values($1,$2,'Evolução lábios',current_date,'frente',$3,'hash',100,$4)",[foto,paciente,foto+'.jpg',usuario]);
 await pg.query("insert into orcamentos_pacientes(id,paciente_id,titulo,itens,total,pagamento,usuario_id) values($1,$2,'Procedimentos',$3::jsonb,550,$4::jsonb,$5)",[orcamento,paciente,JSON.stringify([{nome:'Preenchimento labial'}]),JSON.stringify([{valor:550,forma_pagamento:'pix'}]),usuario]);
 const dia=require('../public/aniversarios').hojeBrasil();await require('../services/caixa').criarServico(db).salvar({id:randomUUID(),tipo:'despesa',descricao:'Aluguel São José',categoria:'Aluguel',valor:100,data_pagamento:dia},{id:usuario});
 const s=require('../services/paciente-unificado').criarServico(db),admin={id:usuario,app_metadata:{ativo:true,papel:'administrador'}},secretaria={id:usuario,app_metadata:{ativo:true,papel:'secretaria'}};
 assert.equal((await s.buscar('autorizacao',0,admin)).grupos.arquivos[0].id,arquivo);
 assert.equal((await s.buscar('sao jose',0,admin)).grupos.fornecedores[0].id,fornecedor);
 assert.equal((await s.buscar('62999991234',0,admin)).grupos.fornecedores[0].id,fornecedor);
 assert.equal((await s.buscar('preenchimento labial',0,admin)).grupos.orcamentos[0].id,orcamento);
 assert.equal((await s.buscar('pagamento',0,admin)).grupos.financeiro[0].paciente_id,paciente);
 assert.equal((await s.buscar('aluguel',0,admin)).grupos.despesas[0].nome,'Aluguel São José');
 assert.equal((await s.buscar('hialuronico',0,admin)).grupos.planos[0].id,plano);
 assert.equal((await s.buscar('evolucao',0,admin)).grupos.fotos[0].id,foto);
 assert.equal((await s.buscar('materiais locais',0,admin)).grupos.materiais[0].paciente_id,paciente);
 assert((await s.buscar('arquivos',0,admin)).grupos.secoes.some(r=>r.pagina==='arquivos.html'));
 const privado=(await s.buscar('autorizacao',0,admin)).grupos.arquivos[0];assert(!('caminho' in privado));assert(!('sha256' in privado));
 const restrito=await s.buscar('autorizacao',0,secretaria);assert(!restrito.grupos.arquivos?.length);assert(!restrito.grupos.fornecedores?.length);
 for(let i=0;i<9;i++)await pg.query("insert into arquivos_clinica(id,titulo,categoria,nome_original,mime,caminho,sha256,tamanho,usuario_id) values($1,$2,'Outros','pag.pdf','application/pdf',$3,'hash',100,$4)",[randomUUID(),'Paginado '+i,randomUUID()+'.pdf',usuario]);
 const primeira=await s.buscar('paginado',0,admin),segunda=await s.buscar('paginado',1,admin);assert.equal(primeira.grupos.arquivos.length,8);assert(primeira.mais.arquivos);assert.equal(segunda.grupos.arquivos.length,1);assert(!primeira.grupos.arquivos.some(r=>r.id===segunda.grupos.arquivos[0].id));
 }finally{await pg.close();}
});
