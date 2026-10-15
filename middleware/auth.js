"use strict";

const criarClienteAuth =
    require("../config/supabaseAuth");

const ACCESS_COOKIE = "kahenna_access_token";
const REFRESH_COOKIE = "kahenna_refresh_token";

function lerCookies(req) {
    const cookies = {};
    const cabecalho = req.headers.cookie || "";

    cabecalho.split(";").forEach((parte) => {
        const separador = parte.indexOf("=");

        if (separador === -1) {
            return;
        }

        const nome = parte.slice(0, separador).trim();
        const valor = parte.slice(separador + 1).trim();

        if (nome) {
            cookies[nome] = decodeURIComponent(valor);
        }
    });

    return cookies;
}

function opcoesCookie(maxAge) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge
    };
}

function salvarSessao(res, sessao) {
    const duracaoAcesso = Math.max(
        Number(sessao.expires_in || 3600) * 1000,
        60 * 1000
    );

    res.cookie(
        ACCESS_COOKIE,
        sessao.access_token,
        opcoesCookie(duracaoAcesso)
    );

    res.cookie(
        REFRESH_COOKIE,
        sessao.refresh_token,
        opcoesCookie(30 * 24 * 60 * 60 * 1000)
    );
}

function limparSessao(res) {
    const opcoes = opcoesCookie(0);

    res.clearCookie(ACCESS_COOKIE, opcoes);
    res.clearCookie(REFRESH_COOKIE, opcoes);
}

async function obterUsuario(req, res) {
    const clienteAuth = criarClienteAuth();
    const cookies = lerCookies(req);
    let accessToken = cookies[ACCESS_COOKIE];

    if (accessToken) {
        const { data, error } =
            await clienteAuth.auth.getUser(accessToken);

        if (!error && data.user) {
            return data.user;
        }
    }

    const refreshToken = cookies[REFRESH_COOKIE];

    if (!refreshToken) {
        return null;
    }

    const { data, error } =
        await clienteAuth.auth.refreshSession({
            refresh_token: refreshToken
        });

    if (error || !data.session || !data.user) {
        limparSessao(res);
        return null;
    }

    accessToken = data.session.access_token;
    salvarSessao(res, data.session);

    return data.user;
}

function obterPapel(usuario) {
    return String(
        usuario?.app_metadata?.papel || ""
    ).trim().toLowerCase();
}

function usuarioEstaAtivo(usuario) {
    return usuario?.app_metadata?.ativo === true && ["administrador", "secretaria"].includes(obterPapel(usuario));
}

async function exigirAutenticacaoApi(req, res, next) {
    try {
        const usuario = await obterUsuario(req, res);

        if (!usuario || !usuarioEstaAtivo(usuario)) {
            limparSessao(res);
            return res.status(401).json({
                sucesso: false,
                mensagem: "Sessão expirada. Entre novamente."
            });
        }

        req.usuario = usuario;
        return next();
    } catch (erro) {
        return next(erro);
    }
}

async function exigirAutenticacaoPagina(req, res, next) {
    try {
        const usuario = await obterUsuario(req, res);

        if (!usuario || !usuarioEstaAtivo(usuario)) {
            limparSessao(res);
            return res.redirect(
                `/login.html?destino=${encodeURIComponent(req.originalUrl)}`
            );
        }

        req.usuario = usuario;
        return next();
    } catch (erro) {
        return next(erro);
    }
}

async function exigirAdministradorApi(req, res, next) {
    try {
        const usuario = req.usuario || await obterUsuario(req, res);

        if (!usuario || !usuarioEstaAtivo(usuario)) {
            limparSessao(res);
            return res.status(401).json({
                sucesso: false,
                mensagem: "Sessão expirada. Entre novamente."
            });
        }

        if (obterPapel(usuario) !== "administrador") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Apenas o administrador pode gerenciar a equipe."
            });
        }

        req.usuario = usuario;
        return next();
    } catch (erro) {
        return next(erro);
    }
}

async function exigirAdministradorPagina(req, res, next) {
    try {
        const usuario = await obterUsuario(req, res);

        if (!usuario || !usuarioEstaAtivo(usuario)) {
            limparSessao(res);
            return res.redirect(
                `/login.html?destino=${encodeURIComponent(req.originalUrl)}`
            );
        }

        if (obterPapel(usuario) !== "administrador") {
            return res.redirect("/dashboard.html");
        }

        req.usuario = usuario;
        return next();
    } catch (erro) {
        return next(erro);
    }
}

module.exports = {
    exigirAdministradorApi,
    exigirAdministradorPagina,
    exigirAutenticacaoApi,
    exigirAutenticacaoPagina,
    limparSessao,
    obterPapel,
    obterUsuario,
    salvarSessao
};
