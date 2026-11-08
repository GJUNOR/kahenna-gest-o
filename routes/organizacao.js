'use strict';
const express=require('express'),{exigirAdministradorApi}=require('../middleware/auth');
module.exports=(db,autorizar=exigirAdministradorApi)=>{const r=express.Router(),s=require('../services/organizacao').criarServico(db);r.use(autorizar);r.use((q,res,next)=>{res.set({'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'});next();});
 let ativos=0;r.use((q,res,next)=>{if(ativos>=2)return res.status(429).json({mensagem:'Aguarde a transferência atual e tente novamente.'});ativos++;let terminou=false;const liberar=()=>{if(!terminou){terminou=true;ativos--;}};res.once('finish',liberar);res.once('close',liberar);next();});
 r.get('/fornecedores',async(q,res)=>res.json({fornecedores:await s.fornecedores()}));r.post('/fornecedores',async(q,res)=>res.json(await s.salvar(q.body,q.usuario)));
 r.get('/arquivos',async(q,res)=>res.json({arquivos:await s.arquivos(q.usuario)}));
 r.post('/arquivos',express.raw({type:'application/octet-stream',limit:'15mb',inflate:false}),async(q,res)=>{let d;try{d=JSON.parse(decodeURIComponent(q.get('X-Arquivo-Meta')||''));}catch{return res.status(400).json({mensagem:'Dados do arquivo inválidos.'});}res.status(201).json(await s.enviar(d,q.body,q.usuario));});
 r.get('/arquivos/:id/baixar',async(q,res)=>{const d=await s.baixar(q.params.id,q.usuario);res.set({'Content-Type':d.mime,'Content-Security-Policy':'sandbox','Content-Disposition':"attachment; filename=\"arquivo."+d.caminho.split('.').pop()+"\"; filename*=UTF-8''"+encodeURIComponent(d.nome_original).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))});res.send(d.bytes);});
 r.use((e,q,res,next)=>res.status(e.statusCode||e.status||500).json({mensagem:e.statusCode?e.message:'Não foi possível concluir a operação.'}));return r;};
