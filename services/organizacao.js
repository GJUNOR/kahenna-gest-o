'use strict';
const {createHash}=require('node:crypto'),{validarId,validarPDF}=require('./documentos');
const fail=(statusCode,message)=>Object.assign(Error(message),{statusCode});
function txt(v,max,req=false){if(typeof v!=='string'||v.length>max||req&&!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw fail(400,'Confira os campos informados.');return v.trim();}
function fornecedor(d){if(typeof d.ativo!=='boolean')throw fail(400,'Situação inválida.');const f={nome:txt(d.nome,160,true),contato:txt(d.contato||'',120),telefone:txt(d.telefone||'',30),email:txt(d.email||'',160),categoria:txt(d.categoria||'',60),observacao:txt(d.observacao||'',1000),ativo:d.ativo};if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))throw fail(400,'E-mail inválido.');if(f.telefone&&!/^\+?[\d\s().-]{8,30}$/.test(f.telefone))throw fail(400,'Telefone inválido.');return f;}
function criarServico(db){
 const ok=r=>{if(r.error)throw fail(r.error.code==='P0001'?409:503,r.error.code==='P0001'?r.error.message:'Não foi possível acessar os registros.');return r.data;};
 async function audit(u,acao,id=null){ok(await db.from('clinica_acessos').insert({usuario_id:u.id,acao,registro_id:id}));}
 async function bucket(){const r=await db.storage.getBucket('kahenna-arquivos');if(r.error||r.data?.public!==false)throw fail(503,'O armazenamento privado de arquivos não está configurado.');return db.storage.from('kahenna-arquivos');}
 return {
  async fornecedores(){return ok(await db.from('fornecedores_clinica').select('*').order('nome').order('id').limit(1000))||[];},
  async salvar(d,u){validarId(d.id);if(d.revisao!=null&&(!Number.isSafeInteger(d.revisao)||d.revisao<0))throw fail(400,'Revisão inválida.');return ok(await db.rpc('kahenna_salvar_fornecedor',{p_id:d.id,p_dados:fornecedor(d),p_revisao:d.revisao??null,p_usuario:u.id}));},
  async arquivos(u){await audit(u,'listar_arquivos');return ok(await db.from('arquivos_clinica').select('id,titulo,categoria,nome_original,tamanho,mime,criado_em').order('criado_em',{ascending:false}).order('id').limit(1000))||[];},
  async enviar(d,bytes,u){validarId(d.id);const titulo=txt(d.titulo,160,true),categoria=txt(d.categoria||'Fichas e modelos',60,true),nome=txt(d.nome,180,true);if(/[\\/\x00-\x1f\x7f]/.test(nome)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>15*1024*1024)throw fail(400,'Envie um arquivo válido de até 15 MB.');let mime,ext;
   if(/\.pdf$/i.test(nome)){validarPDF(bytes,nome);mime='application/pdf';ext='pdf';}
   else if(/\.docx$/i.test(nome)&&bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]))&&bytes.includes(Buffer.from('[Content_Types].xml'))&&bytes.includes(Buffer.from('word/document.xml'))){mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';ext='docx';}
   else if(/\.(png|jpe?g)$/i.test(nome)){const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!png&&!jpg)throw fail(400,'Imagem inválida.');try{bytes=await require('sharp')(bytes,{limitInputPixels:24000000,failOn:'warning'}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();}catch{throw fail(400,'Não foi possível ler a imagem.');}mime='image/jpeg';ext='jpg';}
   else throw fail(400,'Formatos aceitos: PDF, Word (.docx), JPEG e PNG.');
   const sha256=createHash('sha256').update(bytes).digest('hex'),anterior=ok(await db.from('arquivos_clinica').select('*').eq('id',d.id).maybeSingle());if(anterior){if(anterior.sha256!==sha256)throw fail(409,'Operação já utilizada para outro arquivo.');return {id:anterior.id,titulo:anterior.titulo};}
   const storage=await bucket(),caminho=d.id+'.'+ext;
   const upload=await storage.upload(caminho,bytes,{contentType:mime,upsert:false,cacheControl:'0'});
   if(upload.error){
    const codigo=String(upload.error.code||upload.error.error||''),status=String(upload.error.statusCode||upload.error.status||'');
    if(!['Duplicate','ResourceAlreadyExists','KeyAlreadyExists'].includes(codigo)&&status!=='409'&&!(status==='400'&&/already exists/i.test(upload.error.message||'')))throw fail(503,'Não foi possível enviar o arquivo. Tente novamente.');
    const existente=await storage.download(caminho);if(existente.error||!existente.data)throw fail(503,'Não foi possível conferir o envio anterior. Tente novamente.');
    const recuperado=Buffer.from(await existente.data.arrayBuffer());if(recuperado.length!==bytes.length||createHash('sha256').update(recuperado).digest('hex')!==sha256)throw fail(409,'Este envio já contém outro arquivo. Feche e abra o formulário para iniciar um novo envio.');
   }
   const r=await db.from('arquivos_clinica').insert({id:d.id,titulo,categoria,nome_original:ext==='jpg'?nome.replace(/\.[^.]+$/,'.jpg'):nome,mime,caminho,sha256,tamanho:bytes.length,usuario_id:u.id}).select('id,titulo').single();
   if(r.error){
    const salvo=await db.from('arquivos_clinica').select('*').eq('id',d.id).maybeSingle();
    if(!salvo.error&&salvo.data?.sha256===sha256&&salvo.data?.caminho===caminho)return {id:salvo.data.id,titulo:salvo.data.titulo};
    throw fail(503,'O arquivo foi recebido, mas não foi possível finalizar o cadastro. Tente salvar novamente neste formulário.');
   }
   await audit(u,'enviar_arquivo',d.id);return r.data;
  },
  async baixar(id,u){validarId(id);const d=ok(await db.from('arquivos_clinica').select('*').eq('id',id).maybeSingle());if(!d)throw fail(404,'Arquivo não encontrado.');if(!new RegExp('^'+id+'\\.(pdf|docx|jpg)$').test(d.caminho))throw fail(503,'Referência inválida.');await audit(u,'baixar_arquivo',id);const blob=ok(await(await bucket()).download(d.caminho)),bytes=Buffer.from(await blob.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw fail(503,'Falha de integridade do arquivo.');return {...d,bytes};}
 };
}
module.exports={criarServico,fornecedor};
