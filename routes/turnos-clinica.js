'use strict';
const express=require('express'),{exigirAdministradorApi,exigirAutenticacaoApi}=require('../middleware/auth');
module.exports=(db,autorizar=exigirAdministradorApi,autenticar=exigirAutenticacaoApi)=>{
 const r=express.Router();r.use(autenticar);r.use((q,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/',async(q,res)=>{const turnos=[];for(let inicio=0;;inicio+=250){const {data,error}=await db.from('clinica_turnos').select('dia,periodo,revisao').order('dia').range(inicio,inicio+249);if(error)return res.status(503).json({mensagem:'Não foi possível carregar os horários editados.'});turnos.push(...(data||[]).map(t=>({...t,dia:t.dia instanceof Date?t.dia.toISOString().slice(0,10):String(t.dia).slice(0,10)})));if(!data||data.length<250)break;}res.json({turnos});});
 r.put('/',autorizar,async(q,res)=>{
  const {dia,periodo,revisao}=q.body||{};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia||'')||!Number.isFinite(Date.parse(dia+'T12:00:00Z'))||new Date(dia+'T12:00:00Z').toISOString().slice(0,10)!==dia||!['Matutino','Vespertino','Noturno','Sem atendimento'].includes(periodo)||(revisao!=null&&(!Number.isSafeInteger(revisao)||revisao<0)))return res.status(400).json({mensagem:'Confira a data e o período.'});
  const {data,error}=await db.rpc('kahenna_salvar_turno',{p_dia:dia,p_periodo:periodo,p_revisao:revisao??null,p_usuario:q.usuario.id});if(error)return res.status(error.code==='P0001'?409:503).json({mensagem:error.code==='P0001'?error.message:'Não foi possível salvar o horário.'});res.json({turno:data});
 });return r;
};
