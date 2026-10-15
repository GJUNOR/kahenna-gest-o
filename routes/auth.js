"use strict";

const express = require("express");
const authController =
    require("../controllers/authController");

const router = express.Router();

// Limit repeated login attempts without storing passwords or account identifiers.
const tentativas = new Map();
function limitarLogin(req, res, next) {
    const agora = Date.now();
    for (const [ip, item] of tentativas) if (item.expira <= agora) tentativas.delete(ip);
    const ip = req.ip;
    const item = tentativas.get(ip) || { total: 0, expira: agora + 15 * 60 * 1000 };
    if (item.total >= 15) {
        res.set("Retry-After", String(Math.ceil((item.expira - agora) / 1000)));
        return res.status(429).json({ sucesso: false, mensagem: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." });
    }
    if (!tentativas.has(ip) && tentativas.size >= 10000) tentativas.delete(tentativas.keys().next().value);
    item.total += 1;
    tentativas.set(ip, item);
    next();
}
router.post("/login", limitarLogin, authController.entrar);
router.get("/session", authController.consultarSessao);
router.post("/logout", authController.sair);
router.post("/definir-senha", authController.definirSenha);

module.exports = router;
