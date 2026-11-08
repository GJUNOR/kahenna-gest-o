'use strict';

// Search only record metadata. Document bytes and private storage paths stay private.
async function buscarCompleto(db, busca, bate, admin) {
 if (!admin) return {};
 const consulta=(tabela,colunas,ordem='criado_em')=>()=>db.from(tabela).select(colunas).order(ordem,{ascending:false}).order('id');
 const data=v=>String(v||'').slice(0,10).split('-').reverse().join('/');
 const valor=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
 const fontes={
  arquivos:[consulta('arquivos_clinica','id,titulo,categoria,nome_original,criado_em'),r=>[r.titulo,r.categoria,r.nome_original,data(r.criado_em)],r=>({id:r.id,nome:r.titulo,categoria:r.categoria,criado_em:r.criado_em})],
  fornecedores:[()=>db.from('fornecedores_clinica').select('id,nome,contato,telefone,email,categoria,observacao,ativo').eq('ativo',true).order('nome').order('id'),r=>[r.nome,r.contato,r.telefone,String(r.telefone||'').replace(/\D/g,''),r.email,r.categoria,r.observacao],r=>({id:r.id,nome:r.nome,categoria:r.categoria,contato:r.contato})],
  orcamentos:[consulta('orcamentos_pacientes','id,paciente_id,titulo,itens,total,observacao,criado_em,paciente:visitantes(nome)'),r=>[r.titulo,r.paciente?.nome,r.observacao,...(r.itens||[]).map(i=>i.nome),valor(r.total),data(r.criado_em)],r=>({id:r.id,paciente_id:r.paciente_id,nome:r.paciente?.nome||'Paciente',titulo:r.titulo,total:r.total})],
  financeiro:[consulta('lancamentos_financeiros','id,visitante_id,descricao,valor,forma_pagamento,criado_em,paciente:visitantes(nome)'),r=>[r.descricao,r.paciente?.nome,r.forma_pagamento,valor(r.valor),data(r.criado_em)],r=>({id:r.id,paciente_id:r.visitante_id,nome:r.descricao,paciente:r.paciente?.nome||'Paciente',valor:r.valor})],
  despesas:[()=>db.from('caixa_despesas').select('id,descricao,categoria,fornecedor,observacao,valor,data_pagamento,nota_itens').is('excluido_em',null).order('data_pagamento',{ascending:false}).order('id'),r=>[r.descricao,r.categoria,r.fornecedor,r.observacao,...(r.nota_itens||[]).map(i=>i.nome),valor(r.valor),data(r.data_pagamento)],r=>({id:r.id,nome:r.descricao,valor:r.valor,data:r.data_pagamento})],
  planos:[consulta('planos_faciais','id,paciente_id,titulo,pontos,observacao,data_atendimento,paciente:visitantes(nome)','data_atendimento'),r=>[r.titulo,r.paciente?.nome,r.observacao,...(r.pontos||[]).flatMap(p=>[p.produto,p.procedimento,p.lote,p.observacao]),data(r.data_atendimento)],r=>({id:r.id,paciente_id:r.paciente_id,nome:r.titulo,paciente:r.paciente?.nome||'Paciente',data:r.data_atendimento})],
  fotos:[consulta('fotos_evolucao','id,paciente_id,titulo,vista,data_foto,paciente:visitantes(nome)','data_foto'),r=>[r.titulo,r.paciente?.nome,r.vista,data(r.data_foto)],r=>({id:r.id,paciente_id:r.paciente_id,nome:r.titulo,paciente:r.paciente?.nome||'Paciente',data:r.data_foto})],
  materiais:[consulta('estoque_atendimentos','id,paciente_id,descricao,ocorrido_em,paciente:visitantes(nome)','ocorrido_em'),r=>[r.descricao,r.paciente?.nome,data(r.ocorrido_em)],r=>({id:r.id,paciente_id:r.paciente_id,nome:r.descricao,paciente:r.paciente?.nome||'Paciente',data:r.ocorrido_em})],
  procedimentos:[()=>db.from('procedimentos_precos').select('id,nome,unidade,valor').eq('ativo',true).order('nome').order('id'),r=>[r.nome,r.unidade,valor(r.valor)],r=>({id:r.id,nome:r.nome,unidade:r.unidade,valor:r.valor})]
 };
 const grupos=Object.fromEntries(await Promise.all(Object.entries(fontes).map(async([tipo,[q,texto,projetar]])=>[tipo,await busca(q,r=>bate(texto(r).filter(Boolean).join(' ')),projetar)])));
 grupos.secoes=[['inicio','Início','dashboard.html'],['pacientes','Pacientes','leads.html'],['agenda','Agenda','agenda.html'],['caixa','Caixa','estoque.html'],['orcamentos','Orçamentos','orcamentos.html'],['fornecedores','Fornecedores','fornecedores.html'],['arquivos','Arquivos da clínica','arquivos.html'],['equipe','Equipe','configuracoes.html']].filter(([,nome])=>bate(nome)).map(([id,nome,pagina])=>({id,nome,pagina}));return grupos;
}
module.exports={buscarCompleto};
