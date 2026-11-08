'use strict';
const express = require('express');
const { exigirAdministradorApi } = require('../middleware/auth');
module.exports = function (db, autorizar = exigirAdministradorApi) {
    const router = express.Router();
    const servico = require('../services/caixa').criarServico(db);
    router.use(autorizar);
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.get('/painel', async (req, res) => res.json(await servico.painel(req.query)));
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
