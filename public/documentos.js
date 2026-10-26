"use strict";
(() => {
    let pacienteId = null;
    let geracao = 0;
    let enviando = false;
    document.addEventListener("DOMContentLoaded", () => {
        const dialog = document.getElementById("documentosDialog");
        const form = document.getElementById("documentosForm");
        const lista = document.getElementById("documentosLista");
        const status = document.getElementById("documentosStatus");
        const arquivo = document.getElementById("documentosArquivo");
        const enviar = document.getElementById("documentosEnviar");
        let origemFoco;
        function mensagem(texto) { status.textContent = texto; }
        async function lerResposta(resposta) {
            if (resposta.status === 401) throw new Error("Sua sessão expirou. Entre novamente.");
            if (resposta.status === 403) throw new Error("Documentos clínicos disponíveis somente para administradores.");
            const resultado = await resposta.json();
            if (!resposta.ok) throw new Error(resultado.mensagem || "Não foi possível concluir.");
            return resultado;
        }
        async function carregar(id, ticket) {
            lista.replaceChildren();
            mensagem("Carregando documentos…");
            const resultado = await lerResposta(await fetch(`/api/pacientes/${id}/documentos`, { cache: "no-store" }));
            if (ticket !== geracao) return;
            for (const doc of resultado.documentos) {
                const item = document.createElement("li");
                const titulo = document.createElement("strong");
                titulo.textContent = doc.nome_original;
                const info = document.createElement("small");
                info.textContent = `${new Date(doc.criado_em).toLocaleString("pt-BR")} · ${(doc.tamanho_bytes / 1024).toFixed(0)} KB`;
                const link = document.createElement("a");
                link.href = `/api/pacientes/${id}/documentos/${encodeURIComponent(doc.id)}/arquivo`;
                link.textContent = "Baixar PDF";
                link.setAttribute("download", "");
                item.append(titulo, info, link); lista.append(item);
            }
            mensagem(resultado.documentos.length ? `${resultado.documentos.length} documento(s).` : "Nenhum PDF adicionado para este paciente.");
        }
        document.getElementById("documentosFechar").addEventListener("click", () => { if (!enviando) dialog.close(); });
        dialog.addEventListener("cancel", event => { if (enviando) event.preventDefault(); });
        dialog.addEventListener("close", () => { pacienteId = null; geracao++; lista.replaceChildren(); arquivo.value = ""; origemFoco?.focus(); });
        document.addEventListener("click", async event => {
            const botao = event.target.closest("[data-documentos-paciente]");
            if (!botao) return;
            origemFoco = botao;
            pacienteId = botao.dataset.documentosPaciente;
            const ticket = ++geracao;
            document.getElementById("documentosPaciente").textContent = botao.dataset.documentosNome || "Paciente";
            arquivo.value = ""; dialog.showModal();
            try { await carregar(pacienteId, ticket); } catch (erro) { if (ticket === geracao) mensagem(erro.message); }
        });
        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (enviando || !pacienteId) return;
            const file = arquivo.files[0];
            if (!file || !/\.pdf$/i.test(file.name)) return mensagem("Selecione um arquivo PDF.");
            if (file.size === 0 || file.size > 15 * 1024 * 1024) return mensagem("O PDF deve ter entre 1 byte e 15 MB.");
            const id = pacienteId;
            const ticket = geracao;
            enviando = true; enviar.disabled = true; arquivo.disabled = true;
            document.getElementById("documentosFechar").disabled = true;
            mensagem("Enviando PDF… Aguarde a confirmação.");
            try {
                await lerResposta(await fetch(`/api/pacientes/${id}/documentos`, { method: "POST", headers: { "Content-Type": "application/pdf", "X-Document-Name": encodeURIComponent(file.name) }, body: file }));
                arquivo.value = "";
                await carregar(id, ticket);
                mensagem("PDF salvo. Os documentos anteriores foram preservados.");
            } catch (erro) { mensagem(erro.message); }
            finally { enviando = false; enviar.disabled = false; arquivo.disabled = false; document.getElementById("documentosFechar").disabled = false; }
        });
    });
})();
