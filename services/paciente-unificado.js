'use strict';
const {createHash}=require('node:crypto');
const { ordenarMateriais } = require('./estoque');
const obterPapel=u=>String(u?.app_metadata?.papel||'').trim().toLowerCase();
const usuarioEstaAtivo=u=>u?.app_metadata?.ativo===true&&['administrador','secretaria'].includes(obterPapel(u));
const falha=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
function id(v){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw falha(400,'Identificador inválido.');return v;}
function texto(v,max){if(v==null)return '';if(typeof v!=='string'||v.length>max||/\p{Cc}/u.test(v))throw falha(400,'Confira os campos informados.');return v.trim();}
function pagina(v=0){if(!/^\d{1,5}$/.test(String(v)))throw falha(400,'Página inválida.');return Number(v);}
const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function telefone(v){let n=String(v??'').replace(/\D/g,'');if([12,13].includes(n.length)&&n.startsWith('55'))n=n.slice(2);return n;}
function permissao(u){if(!usuarioEstaAtivo(u))throw falha(401,'Sessão expirada. Entre novamente.');return obterPapel(u)==='administrador';}
function conferir(r){if(r.error){if(r.error.code==='P0001')throw falha(400,r.error.message);throw falha(503,'Não foi possível consultar os registros. Tente novamente.');}return r.data;}
function criarServico(db){
 const t=(table,cols,opts)=>db.from(table).select(cols,opts);
 const resultados=async q=>conferir(await q)||[];
 const contar=async q=>{const r=await q;conferir(r);return r.count||0;};
 // Scan only the projected columns, in bounded requests and deterministic order.
 // A search stops as soon as it has one more match than the requested page.
 async function percorrer(consulta,ler){for(let inicio=0;;inicio+=250){const rows=await resultados(consulta().range(inicio,inicio+249));for(const r of rows)if(ler(r)===false)return;if(rows.length<250)return;}}
 async function buscarGrupo(consulta,filtro,projetar,indice){const itens=[];let encontrados=0;await percorrer(consulta,r=>{if(!filtro(r))return;if(encontrados++<indice*8)return;itens.push(projetar(r));if(itens.length===9)return false;});return itens;}
 async function auditar(p,u){conferir(await db.from('documentos_auditoria').insert({paciente_id:p,usuario_id:id(u.id),acao:'listar'}));}
 const nomesPaciente=()=>t('visitantes','visitante_id,nome,telefone').order('nome').order('visitante_id');
 return {
 async duplicados(d){const nome=texto(d.nome,200),fone=texto(d.telefone,30),ignorar=d.ignorar?id(d.ignorar):null;
  if(normal(nome).length<3&&telefone(fone).length<8)return {itens:[],total:0,confirmacao:null};
  const n=normal(nome),f=telefone(fone),partes=n.split(' '),r={itens:[],total:0};
  await percorrer(nomesPaciente,p=>{if(p.visitante_id===ignorar)return;const outro=normal(p.nome),tokens=outro.split(' '),motivos=[];if(f.length>=8&&telefone(p.telefone)===f)motivos.push('Mesmo telefone');if(n.length>=3&&n===outro)motivos.push('Mesmo nome');else if(n.length>=5&&partes.length>1&&tokens.length>1&&tokens[0]===partes[0]&&tokens.at(-1)===partes.at(-1))motivos.push('Nome semelhante');if(motivos.length){r.total++;if(r.itens.length<10)r.itens.push({visitante_id:p.visitante_id,nome:p.nome,telefone:p.telefone,motivos});}});
  const confirmacao=r.total?createHash('sha256').update(JSON.stringify({nome:normal(nome),telefone:telefone(fone),ignorar,resultado:r})).digest('hex'):null;
  return {...r,confirmacao};
 },
 async verificarCadastro(d,ignorar){
  let nome=d.nome,fone=d.telefone;
  if(ignorar){id(ignorar);const anterior=conferir(await db.from('visitantes').select('nome,telefone').eq('visitante_id',ignorar).maybeSingle());if(!anterior)throw falha(404,'Paciente não encontrado.');nome=d.nome??anterior.nome;fone=d.telefone??anterior.telefone;if(normal(nome)===normal(anterior.nome)&&telefone(fone)===telefone(anterior.telefone))return;}
  const r=await this.duplicados({nome,telefone:fone,ignorar});if(r.total&&d.confirmacao_duplicado!==r.confirmacao){const e=falha(409,'Encontramos um possível cadastro duplicado. Confira antes de continuar.');Object.assign(e,{codigo:'POSSIVEL_DUPLICADO',duplicados:r.itens,total:r.total,confirmacao:r.confirmacao});throw e;}
 },
 async resumo(p,u){const admin=permissao(u);id(p);const v=conferir(await t('visitantes','visitante_id,nome,telefone,status,criado_em,data_nascimento,primeira_utm_source').eq('visitante_id',p).maybeSingle());if(!v)throw falha(404,'Paciente não encontrado.');
  let centavos=0,financeiro=0;const financeiroTask=percorrer(()=>t('lancamentos_financeiros','id,tipo,valor').eq('visitante_id',p).order('id'),f=>{financeiro++;centavos+=(f.tipo==='reembolso'?-1:1)*Math.round(Number(f.valor)*100);});
  const [a,atendimentos,materiais,documentos]=await Promise.all([t('agendamentos','id,data_avaliacao,observacao').eq('visitante_id',p).eq('status','agendado').gte('data_avaliacao',new Date().toISOString()).order('data_avaliacao').order('id').limit(1).maybeSingle().then(conferir),contar(t('agendamentos','id',{count:'exact',head:true}).eq('visitante_id',p).neq('status','cancelado')),admin?contar(t('estoque_atendimentos','id',{count:'exact',head:true}).eq('paciente_id',p)):null,admin?contar(t('documentos_pacientes','id',{count:'exact',head:true}).eq('paciente_id',p)):null,financeiroTask]);
  const {visitante_id,...dados}=v;return {paciente:{id:visitante_id,...dados},proximo:a?{id:a.id,data:a.data_avaliacao,observacao:a.observacao}:null,recebido:centavos/100,contagens:{atendimentos,financeiro,materiais,documentos},permissoes:{materiais:admin,documentos:admin}};
 },
 async secao(p,s,page,u){const admin=permissao(u);id(p);const n=pagina(page),opt={count:'exact'},inicio=n*20;let consulta,projetar;
  if(!['atendimentos','financeiro','materiais','documentos'].includes(s))throw falha(400,'Seção inválida.');if(['materiais','documentos'].includes(s)&&!admin)throw falha(403,'Acesso restrito ao administrador.');
  if(!conferir(await t('visitantes','visitante_id').eq('visitante_id',p).maybeSingle()))throw falha(404,'Paciente não encontrado.');
  if(s==='atendimentos'){consulta=t('agendamentos','id,data_avaliacao,status,observacao,confirmado_em,lembrete_enviado_em',opt).eq('visitante_id',p).neq('status','cancelado').order('data_avaliacao',{ascending:false});projetar=({id,data_avaliacao,status,observacao,confirmado_em,lembrete_enviado_em})=>({id,data_avaliacao,status,observacao,confirmado_em,lembrete_enviado_em});}
  if(s==='financeiro'){consulta=t('lancamentos_financeiros','id,tipo,descricao,valor,forma_pagamento,parcelas,criado_em',opt).eq('visitante_id',p).order('criado_em',{ascending:false});projetar=({id,tipo,descricao,valor,forma_pagamento,parcelas,criado_em})=>({id,tipo,descricao,valor,forma_pagamento,parcelas,criado_em});}
  if(s==='materiais'){consulta=t('estoque_atendimentos','id,descricao,ocorrido_em,custo_total,itens:estoque_movimentos(quantidade,unidade_registro,valor_total,produto:estoque_produtos(nome,categoria))',opt).eq('paciente_id',p).order('ocorrido_em',{ascending:false}).order('criado_em',{ascending:false});projetar=({id,descricao,ocorrido_em,custo_total,itens})=>({id,descricao,ocorrido_em,custo_total,itens:(itens||[]).sort((a,b)=>ordenarMateriais(a.produto,b.produto)).map(m=>({nome:m.produto?.nome||'Produto',quantidade:m.quantidade,unidade:m.unidade_registro,valor:m.valor_total}))});}
  if(s==='documentos'){consulta=t('documentos_pacientes','id,nome_original,tamanho_bytes,sha256,criado_em,arquivo:documentos_arquivos(finalizado_em)',opt).eq('paciente_id',p).order('criado_em',{ascending:false});projetar=({id,nome_original,tamanho_bytes,sha256,criado_em,arquivo})=>({id,nome_original,tamanho_bytes,sha256,criado_em,finalizado_em:arquivo?.finalizado_em||null,estado:arquivo?'arquivado':'pendente'});}
  const r=await consulta.order('id',{ascending:false}).range(inicio,inicio+19);const itens=(conferir(r)||[]).map(projetar);if(s==='documentos')await auditar(p,u);return {itens,total:r.count||0,pagina:n};
 },
 async buscar(q,page,u){const admin=permissao(u),termo=texto(q,80),n=pagina(page),chave=normal(termo),fone=termo.replace(/\D/g,'');if(chave.length<2)throw falha(400,'Informe pelo menos dois caracteres para buscar.');const bate=v=>normal(v).includes(chave),busca=(c,f,m)=>buscarGrupo(c,f,m,n);
  const [pacientes,agenda,produtos,lotes,documentos]=await Promise.all([
   busca(nomesPaciente,p=>bate(p.nome)||(fone.length>=3&&String(p.telefone).includes(fone)),p=>({id:p.visitante_id,nome:p.nome,telefone:p.telefone})),
   busca(()=>t('agendamentos','id,visitante_id,data_avaliacao,status,observacao,paciente:visitantes(nome)').neq('status','cancelado').order('data_avaliacao',{ascending:false}).order('id'),a=>bate((a.paciente?.nome||'')+' '+(a.observacao||'')),a=>({id:a.id,paciente_id:a.visitante_id,nome:a.paciente?.nome||'Paciente',data_avaliacao:a.data_avaliacao,status:a.status})),
   admin?busca(()=>t('estoque_produtos','id,nome,categoria,quantidade,unidade').eq('ativo',true).order('nome').order('id'),p=>bate(p.nome+' '+p.categoria),({id,nome,categoria,quantidade,unidade})=>({id,nome,categoria,quantidade,unidade})):[],
   admin?busca(()=>t('estoque_lotes','id,codigo,validade,quantidade_restante,produto:estoque_produtos(nome,unidade,ativo)').gt('quantidade_restante',0).order('validade',{nullsFirst:false}).order('id'),l=>l.produto?.ativo&&l.codigo&&bate(l.codigo+' '+l.produto.nome),l=>({id:l.id,codigo:l.codigo,validade:l.validade,quantidade_restante:l.quantidade_restante,nome:l.produto.nome,unidade:l.produto.unidade})):[],
   admin?busca(()=>t('documentos_pacientes','id,paciente_id,nome_original,criado_em,paciente:visitantes(nome)').order('criado_em',{ascending:false}).order('id'),d=>bate(d.nome_original+' '+(d.paciente?.nome||'')),d=>({id:d.id,paciente_id:d.paciente_id,nome_original:d.nome_original,nome:d.paciente?.nome||'Paciente'})):[]
  ]);
  await Promise.all([...new Set(documentos.slice(0,8).map(d=>d.paciente_id))].map(p=>auditar(p,u)));
  const grupos={},mais={};for(const [tipo,rows] of Object.entries({pacientes,agenda,produtos,lotes,documentos})){grupos[tipo]=rows.slice(0,8);mais[tipo]=rows.length>8;}return {grupos,mais,pagina:n};
 }
};}
module.exports={criarServico,id,normal,telefone,permissao};
