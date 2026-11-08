'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {validarId}=require('./documentos');
const {hojeBrasil}=require('../public/aniversarios');
const falha=(statusCode,message)=>Object.assign(Error(message),{statusCode});
const vistas=['frente','perfil_esquerdo','perfil_direito'];
function texto(v,n,obrigatorio=false){if(typeof v!=='string'||v.length>n||obrigatorio&&!v.trim())throw falha(400,'Confira os campos informados.');return v.trim();}
function dia(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v<'1900-01-01')throw falha(400,'Data inválida.');return v;}
function plano(d){
 if(!['planejado','realizado'].includes(d.estado)||!Array.isArray(d.pontos)||d.pontos.length>200)throw falha(400,'Plano inválido.');
 const ids=new Set();
 const pontos=d.pontos.map(p=>{validarId(p.id);if(ids.has(p.id)||!vistas.includes(p.vista)||!['ponto','linha'].includes(p.tipo))throw falha(400,'Marcação inválida.');ids.add(p.id);
  for(const k of ['x','y',...(p.tipo==='linha'?['x2','y2']:[])])if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>1)throw falha(400,'Posição inválida.');
  if(!['ml','U','fios'].includes(p.unidade)||typeof p.quantidade!=='number'||!Number.isFinite(p.quantidade)||p.quantidade<=0||p.quantidade>10000||Math.abs(p.quantidade*1000-Math.round(p.quantidade*1000))>0.00001||p.unidade==='fios'&&!Number.isInteger(p.quantidade))throw falha(400,'Quantidade inválida.');
  return {id:p.id,vista:p.vista,tipo:p.tipo,x:p.x,y:p.y,...(p.tipo==='linha'?{x2:p.x2,y2:p.y2}:{}),produto:texto(p.produto,120,true),procedimento:texto(p.procedimento,60,true),quantidade:p.quantidade,unidade:p.unidade,lote:texto(p.lote||'',120),validade:p.validade?dia(p.validade):'',observacao:texto(p.observacao||'',400)};
 });
 const data=dia(d.data_atendimento);if(d.estado==='realizado'&&data>hojeBrasil())throw falha(400,'Um atendimento realizado não pode ter data futura.');
 return {titulo:texto(d.titulo,120,true),estado:d.estado,data_atendimento:data,pontos,observacao:texto(d.observacao||'',2000)};
}
function criarServico(db){
 const ok=r=>{if(r.error)throw falha(r.error.code==='P0001'?409:503,r.error.code==='P0001'?r.error.message:'Não foi possível acessar os registros.');return r.data;};
 async function paciente(p){validarId(p);if(!ok(await db.from('visitantes').select('visitante_id').eq('visitante_id',p).maybeSingle()))throw falha(404,'Paciente não encontrado.');}
 async function audit(p,u,acao,id=null){ok(await db.from('estetica_auditoria').insert({paciente_id:p,usuario_id:u.id,acao,registro_id:id}));}
 async function bucket(){const r=await db.storage.getBucket('kahenna-evolucao');if(r.error||r.data?.public!==false)throw falha(503,'O armazenamento privado de fotos não está configurado.');return db.storage.from('kahenna-evolucao');}
 return {
  async listar(p,u){await paciente(p);await audit(p,u,'consultar');return {planos:ok(await db.from('planos_faciais').select('*').eq('paciente_id',p).order('data_atendimento',{ascending:false}).order('id').limit(200))||[],fotos:(ok(await db.from('fotos_evolucao').select('id,titulo,data_foto,vista').eq('paciente_id',p).order('data_foto',{ascending:false}).order('id').limit(200))||[])};},
  async salvar(p,d,u){await paciente(p);validarId(d.id);if(d.revisao!=null&&(!Number.isSafeInteger(d.revisao)||d.revisao<0))throw falha(400,'Revisão inválida.');return ok(await db.rpc('kahenna_salvar_plano',{p_id:d.id,p_paciente:p,p_dados:plano(d),p_revisao:d.revisao??null,p_usuario:u.id}));},
  async foto(p,d,buffer,u){await paciente(p);if(!vistas.includes(d.vista)||!Buffer.isBuffer(buffer)||buffer.length>8*1024*1024||!buffer.length)throw falha(400,'Envie uma foto JPEG ou PNG de até 8 MB.');
   if(!(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)&&!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw falha(400,'Use uma imagem JPEG ou PNG válida.');
   let limpo;try{limpo=await require('sharp')(buffer,{limitInputPixels:24000000,failOn:'warning'}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();}catch{throw falha(400,'Não foi possível ler esta imagem. Use JPEG ou PNG.');}
   const id=randomUUID(),caminho=p+'/'+id+'.jpg',titulo=texto(d.titulo,120,true),data_foto=dia(d.data_foto);if(data_foto>hojeBrasil())throw falha(400,'A foto não pode ter data futura.');
   const storage=await bucket();ok(await storage.upload(caminho,limpo,{contentType:'image/jpeg',upsert:false,cacheControl:'0'}));
   const record={id,paciente_id:p,titulo,data_foto,vista:d.vista,caminho,sha256:createHash('sha256').update(limpo).digest('hex'),tamanho:limpo.length,usuario_id:u.id};
   const r=await db.from('fotos_evolucao').insert(record).select('id,titulo,data_foto,vista').single();if(r.error){await storage.remove([caminho]);throw falha(503,'Não foi possível registrar a foto.');}await audit(p,u,'enviar_foto',id);return r.data;
  },
  async imagem(p,id,u){await paciente(p);validarId(id);const foto=ok(await db.from('fotos_evolucao').select('*').eq('paciente_id',p).eq('id',id).maybeSingle());if(!foto)throw falha(404,'Foto não encontrada.');if(foto.caminho!==p+'/'+id+'.jpg')throw falha(503,'Referência inválida.');await audit(p,u,'ver_foto',id);const blob=ok(await(await bucket()).download(foto.caminho)),bytes=Buffer.from(await blob.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==foto.sha256)throw falha(503,'Falha de integridade da foto.');return bytes;}
 };
}
module.exports={criarServico,plano,vistas};
