'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {preparar,usuario,paciente}=require('./novidades-local-db.cjs'),{hojeBrasil}=require('../public/aniversarios');
test('novidades: planos isolados por paciente, revisões, fotos privadas, arquivos, fornecedores e nota sem duplicação',async()=>{
 const {pg,db,objects}=await preparar(),u={id:usuario};try{
 const s=require('../services/estetica').criarServico(db),dia=hojeBrasil(),ponto={id:randomUUID(),vista:'frente',tipo:'ponto',x:.4,y:.4,produto:'Produto de teste',procedimento:'Preenchimento',quantidade:.2,unidade:'ml',lote:'L001',validade:'2030-01-01',observacao:''},p={id:randomUUID(),titulo:'Plano fictício',estado:'planejado',data_atendimento:dia,pontos:[ponto],observacao:''};
 const saved=await s.salvar(paciente,p,u);await s.salvar(paciente,p,u);assert.equal((await s.listar(paciente,u)).planos.length,1);
 await s.salvar(paciente,{...p,estado:'realizado',revisao:0},u);await assert.rejects(s.salvar(paciente,{...p,titulo:'Outra edição',revisao:0},u),/outra janela/);
 await assert.rejects(s.salvar(paciente,{...p,pontos:[{...ponto,x:2}],revisao:1},u),/Posição/);await assert.rejects(s.salvar(paciente,{...p,pontos:[{...ponto,unidade:'fios',quantidade:.2}]},u),/Quantidade/);
 const outro=randomUUID();await pg.query("insert into visitantes(visitante_id,nome,telefone) values($1,'Outro paciente fictício','11999990001')",[outro]);await assert.rejects(s.salvar(outro,{...p,revisao:1},u),/outro paciente/);
 const imagem=await require('sharp')({create:{width:30,height:30,channels:3,background:'#eee0dc'}}).png().toBuffer();
 const f=await s.foto(paciente,{titulo:'Foto local',data_foto:dia,vista:'frente'},imagem,u);assert((await s.imagem(paciente,f.id,u)).length>0);await assert.rejects(s.imagem(outro,f.id,u),/não encontrada/);await assert.rejects(s.foto(paciente,{titulo:'x',data_foto:dia,vista:'frente'},Buffer.from('<svg></svg>'),u),/JPEG/);
 assert.equal((await pg.query('select count(*)::int n from estetica_auditoria')).rows[0].n,5);
 const org=require('../services/organizacao').criarServico(db),forn={id:randomUUID(),nome:'Fornecedor fictício',contato:'Contato',telefone:'11999990000',email:'teste@example.invalid',categoria:'Produtos estéticos',observacao:'Teste',ativo:true};await org.salvar(forn,u);await org.salvar(forn,u);assert.equal((await org.fornecedores()).length,1);
 await org.salvar({...forn,nome:'Fornecedor atualizado',revisao:0},u);await assert.rejects(org.salvar({...forn,nome:'Conflito',revisao:0},u),/outra janela/);
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'),a={id:randomUUID(),titulo:'Ficha modelo',categoria:'Fichas e modelos',nome:'modelo.pdf'};await org.enviar(a,pdf,u);await org.enviar(a,pdf,u);assert.equal((await org.arquivos(u)).length,1);assert.deepEqual((await org.baixar(a.id,u)).bytes,pdf);await assert.rejects(org.enviar({...a,id:randomUUID(),nome:'executavel.pdf'},Buffer.from('exe'),u),/PDF/);
 const nota={id:randomUUID(),chave:'1'.repeat(44),tipo:'compra',descricao:'Compra fictícia',categoria:'Produtos',valor:100,data_pagamento:dia,itens:[{nome:'Produto local',quantidade:2,valor:100,unidade:'un',lote:'L1',validade:'2030-01-01'}]};const dados=require('../services/notas').validar(nota);
 const params={p_id:nota.id,p_dados:dados,p_chave:nota.chave,p_usuario:usuario};assert.equal((await db.rpc('kahenna_importar_nota',params)).error,undefined);assert.match((await db.rpc('kahenna_importar_nota',params)).error.message,/já foi importada/);assert.equal((await require('../services/caixa').criarServico(db).painel({mes:dia.slice(0,7)})).gastos,100);
 await require('../services/caixa').criarServico(db).excluir({id:nota.id,origem:'despesa',revisao:0},u);assert.equal((await require('../services/caixa').criarServico(db).painel({mes:dia.slice(0,7)})).gastos,0);
 assert.equal((await db.rpc('kahenna_importar_nota',{...params,p_id:randomUUID()})).error,undefined);assert.equal((await pg.query('select count(*)::int n from caixa_despesas')).rows[0].n,1);
 const oldBucket=db.storage.getBucket;db.storage.getBucket=async()=>({data:{public:true}});await assert.rejects(s.foto(paciente,{titulo:'Bloqueado',data_foto:dia,vista:'frente'},imagem,u),/privado/);await assert.rejects(org.baixar(a.id,u),/privado/);db.storage.getBucket=oldBucket;
 for(const table of ['planos_faciais','fotos_evolucao','estetica_auditoria','arquivos_clinica','fornecedores_clinica','clinica_acessos'])assert.equal((await pg.query('select has_table_privilege(\'anon\',$1,\'SELECT\') ok',[table])).rows[0].ok,false);
 }finally{await pg.close();}
});
