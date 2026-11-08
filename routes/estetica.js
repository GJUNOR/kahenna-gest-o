'use strict';
const express=require('express'),{exigirAdministradorApi}=require('../middleware/auth');
module.exports=(db,autorizar=exigirAdministradorApi)=>{
 const r=express.Router(),s=require('../services/estetica').criarServico(db);r.use(autorizar);r.use((q,res,next)=>{res.set({'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'});next();});
 let ativos=0;r.use((q,res,next)=>{if(ativos>=2)return res.status(429).json({mensagem:'Aguarde a transferência atual e tente novamente.'});ativos++;let terminou=false;const liberar=()=>{if(!terminou){terminou=true;ativos--;}};res.once('finish',liberar);res.once('close',liberar);next();});
 r.get('/pacientes/:p',async(q,res)=>res.json(await s.listar(q.params.p,q.usuario)));
 r.post('/pacientes/:p/planos',async(q,res)=>res.json(await s.salvar(q.params.p,q.body,q.usuario)));
 r.post('/pacientes/:p/fotos',express.raw({type:['image/jpeg','image/png'],limit:'8mb',inflate:false}),async(q,res)=>{
  let meta;try{meta=JSON.parse(decodeURIComponent(q.get('X-Foto-Meta')||''));}catch{ return res.status(400).json({mensagem:'Dados da foto inválidos.'});}
  res.status(201).json(await s.foto(q.params.p,meta,q.body,q.usuario));
 });
 r.get('/pacientes/:p/fotos/:id',async(q,res)=>res.type('image/jpeg').send(await s.imagem(q.params.p,q.params.id,q.usuario)));
 r.use((e,q,res,next)=>res.status(e.statusCode||e.status||500).json({mensagem:e.statusCode?e.message:'Não foi possível concluir a operação.'}));return r;
};
