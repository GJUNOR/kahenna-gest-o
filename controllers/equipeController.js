"use strict";

const supabase = require("../config/supabase");

function mensagemErro(error, padrao) {
    const texto = String(error?.message || "");

    if (/already|registered|exists/i.test(texto)) {
        return "Este e-mail já possui acesso ao sistema.";
    }

    return texto || padrao;
}

function resumirUsuario(usuario) {
    return {
        id: usuario.id,
        nome: usuario.user_metadata?.nome || "Sem nome",
        email: usuario.email || "",
        papel: usuario.app_metadata?.papel || "secretaria",
        ativo: usuario.app_metadata?.ativo !== false,
        criado_em: usuario.created_at,
        ultimo_acesso: usuario.last_sign_in_at || null,
        convite_aceito: Boolean(usuario.last_sign_in_at)
    };
}

async function listarEquipe(req, res) {
    const { data, error } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 100
    });

    if (error) {
        throw error;
    }

    const usuarios = (data.users || [])
        .filter((usuario) =>
            ["administrador", "secretaria"].includes(
                usuario.app_metadata?.papel
            )
        )
        .map(resumirUsuario)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    return res.json({ sucesso: true, data: usuarios });
}

async function convidarSecretaria(req, res) {
    const nome = String(req.body.nome || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!nome || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Informe o nome e um e-mail válido."
        });
    }

    const origem = String(process.env.SITE_URL || "").trim() ||
        `${req.protocol}://${req.get("host")}`;

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
            data: { nome },
            redirectTo: `${origem.replace(/\/$/, "")}/definir-senha.html`
        }
    );

    if (error || !data.user) {
        return res.status(400).json({
            sucesso: false,
            mensagem: mensagemErro(error, "Não foi possível enviar o convite.")
        });
    }

    const appMetadata = {
        ...(data.user.app_metadata || {}),
        papel: "secretaria",
        ativo: true
    };

    const { error: erroAtualizacao } =
        await supabase.auth.admin.updateUserById(data.user.id, {
            app_metadata: appMetadata,
            user_metadata: {
                ...(data.user.user_metadata || {}),
                nome
            }
        });

    if (erroAtualizacao) {
        throw erroAtualizacao;
    }

    return res.status(201).json({
        sucesso: true,
        mensagem: `Convite enviado para ${email}.`
    });
}

async function alterarAcesso(req, res) {
    const usuarioId = String(req.params.id || "").trim();
    const ativo = req.body.ativo === true;

    if (!usuarioId) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário inválido." });
    }

    if (usuarioId === req.usuario.id && !ativo) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Você não pode desativar o próprio acesso."
        });
    }

    const { data, error } = await supabase.auth.admin.getUserById(usuarioId);

    if (error || !data.user) {
        return res.status(404).json({ sucesso: false, mensagem: "Membro não encontrado." });
    }

    if (data.user.app_metadata?.papel === "administrador") {
        return res.status(400).json({
            sucesso: false,
            mensagem: "O acesso do administrador principal não pode ser alterado aqui."
        });
    }

    const { error: erroAtualizacao } =
        await supabase.auth.admin.updateUserById(usuarioId, {
            app_metadata: {
                ...(data.user.app_metadata || {}),
                papel: "secretaria",
                ativo
            }
        });

    if (erroAtualizacao) {
        throw erroAtualizacao;
    }

    return res.json({
        sucesso: true,
        mensagem: ativo ? "Acesso reativado." : "Acesso desativado."
    });
}

module.exports = {
    alterarAcesso,
    convidarSecretaria,
    listarEquipe
};
