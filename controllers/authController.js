"use strict";

const criarClienteAuth =
    require("../config/supabaseAuth");
const {
    limparSessao,
    obterPapel,
    obterUsuario,
    salvarSessao
} = require("../middleware/auth");

const supabaseAdmin = require("../config/supabase");

async function entrar(req, res) {
    const identificador = String(req.body.usuario || req.body.email || "")
        .trim()
        .toLowerCase();

    const senha = String(req.body.senha || "");

    if (!identificador || !senha || identificador.length > 254 || senha.length > 1024) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Informe o usuário e a senha."
        });
    }

    let email = identificador;
    if (!identificador.includes("@")) {
        if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(identificador)) {
            return res.status(401).json({ sucesso: false, mensagem: "Usuário ou senha inválidos." });
        }
        const { data: acesso, error: erroAcesso } = await supabaseAdmin.from("acessos")
            .select("user_id").eq("usuario", identificador).maybeSingle();
        if (erroAcesso) throw erroAcesso;
        if (!acesso) return res.status(401).json({ sucesso: false, mensagem: "Usuário ou senha inválidos." });
        const { data: identidade, error: erroIdentidade } = await supabaseAdmin.auth.admin.getUserById(acesso.user_id);
        if (erroIdentidade || !identidade.user?.email) {
            return res.status(401).json({ sucesso: false, mensagem: "Usuário ou senha inválidos." });
        }
        email = identidade.user.email;
    }
    const clienteAuth = criarClienteAuth();

    const { data, error } =
        await clienteAuth.auth.signInWithPassword({
            email,
            password: senha
        });

    if (error || !data.session || !data.user) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Usuário ou senha inválidos."
        });
    }


    if (data.user.app_metadata?.ativo !== true || !["administrador", "secretaria"].includes(obterPapel(data.user))) {
        limparSessao(res);
        return res.status(403).json({
            sucesso: false,
            mensagem: "Este acesso foi desativado pelo administrador."
        });
    }

    salvarSessao(res, data.session);

    return res.status(200).json({
        sucesso: true,
        usuario: {
            id: data.user.id,
            email: data.user.email,
            nome: data.user.user_metadata?.nome || "",
            papel: obterPapel(data.user)
        }
    });
}

async function consultarSessao(req, res) {
    const usuario = await obterUsuario(req, res);

    if (!usuario || usuario.app_metadata?.ativo !== true || !["administrador", "secretaria"].includes(obterPapel(usuario))) {
        return res.status(401).json({
            sucesso: false,
            autenticado: false
        });
    }

    return res.status(200).json({
        sucesso: true,
        autenticado: true,
        usuario: {
            id: usuario.id,
            email: usuario.email,
            nome: usuario.user_metadata?.nome || "",
            papel: obterPapel(usuario)
        }
    });
}

async function sair(req, res) {
    limparSessao(res);

    return res.status(200).json({
        sucesso: true
    });
}

async function definirSenha(req, res) {
    const accessToken = String(req.body.access_token || "").trim();
    const senha = String(req.body.senha || "");

    if (!accessToken || senha.length < 10) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "O convite é inválido ou a senha tem menos de 10 caracteres."
        });
    }

    const clienteAuth = criarClienteAuth();
    const { data, error } = await clienteAuth.auth.getUser(accessToken);

    if (error || !data.user) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Este convite expirou. Peça um novo convite ao administrador."
        });
    }

    const { error: erroSenha } =
        await clienteAuth.auth.admin.updateUserById(data.user.id, {
            password: senha
        });

    if (erroSenha) {
        throw erroSenha;
    }

    return res.json({
        sucesso: true,
        mensagem: "Senha criada. Você já pode entrar no sistema."
    });
}

module.exports = {
    consultarSessao,
    definirSenha,
    entrar,
    sair
};
