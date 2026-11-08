'use strict';
const express = require('express');
const { exigirAdministradorApi } = require('../middleware/auth');
module.exports = function (db, autorizar = exigirAdministradorApi) {
    const router = express.Router();
    const servico = require('../services/caixa').criarServico(db);
    router.use(autorizar);
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.get('/painel', async (req, res) => res.json(await servico.painel(req.query)));
    router.post('/importar-nota',async(req,res)=>{
        const dados=require('../services/notas').validar(req.body||{});
        const {data,error}=await db.rpc('kahenna_importar_nota',{p_id:req.body.id,p_dados:dados,p_chave:req.body.chave,p_usuario:req.usuario.id});
        if(error)throw Object.assign(Error(error.code==='P0001'?error.message:'Não foi possível salvar a nota.'),{statusCode:error.code==='P0001'?409:503});
        res.json(data);
    });
    router.post('/despesas', async (req, res) => res.json(await servico.salvar(req.body || {}, req.usuario)));
    router.post('/excluir', async (req, res) => {
        await servico.excluir(req.body || {}, req.usuario);
        res.json({ sucesso: true });
    });
    router.get('/taxas', async (req, res) => res.json(await servico.taxas()));
    router.put('/taxas', async (req, res) => res.json(await servico.salvarTaxas(req.body || {}, req.usuario)));
    router.use((err, req, res, next) => res.status(err.statusCode || 500).json({ mensagem: err.statusCode ? err.message : 'Não foi possível atualizar o caixa.' }));
    return router;
};
