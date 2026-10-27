"use strict";
(() => {
    document.addEventListener("DOMContentLoaded", () => {
        const el = id => document.getElementById(id);
        const dialog = el("documentosDialog"), lista = el("documentosLista"), arquivo = el("documentosArquivo");
        let paciente = null, origemFoco, geracao = 0, ocupado = false, aba = "pendente", docs = [], selecionado = null, blobUrl = null;
        let pdfTask = null, pdfDocument = null, renderTask = null, pagina = 1, visualizacao = 0;
        const vistas = new Set();
        const mensagem = texto => { el("documentosStatus").textContent = texto; };
        function limparVisualizacao() {
            visualizacao++; renderTask?.cancel(); renderTask = null;
            pdfTask?.destroy().catch(() => {}); pdfTask = null; pdfDocument = null; vistas.clear(); pagina = 1;
            el("documentosZoom").value = "1"; el("documentosPagina").style.width = "100%";
            el("documentosPagina").width = 0; el("documentosPaginaAtual").textContent = "";
            selecionado = null; el("documentosAbrir").removeAttribute("href");
            if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null;
            el("documentosConferencia").hidden = true; el("documentosConferido").checked = false; el("documentosFinalizar").disabled = true;
        }
        function bloquear(valor) {
            ocupado = valor;
            dialog.querySelectorAll("button,input,select").forEach(control => { control.disabled = valor; });
            const revisavel = !!pdfDocument && vistas.size === pdfDocument.numPages;
            el("documentosConferido").disabled = valor || !revisavel;
            el("documentosFinalizar").disabled = valor || !revisavel || !selecionado || !el("documentosConferido").checked;
            el("documentosAnterior").disabled = valor || !pdfDocument || pagina <= 1;
            el("documentosProxima").disabled = valor || !pdfDocument || pagina >= pdfDocument.numPages;
        }
        async function renderizarPagina() {
            const ticket = visualizacao;
            const page = await pdfDocument.getPage(pagina);
            if (ticket !== visualizacao) return;
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(2400 / Math.max(base.width, base.height), 4) });
            const canvas = el("documentosPagina"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
            await renderTask.promise;
            if (ticket !== visualizacao) return;
            renderTask = null; vistas.add(pagina); canvas.setAttribute("aria-label", `Página ${pagina} de ${pdfDocument.numPages}`);
            el("documentosPaginaAtual").textContent = `Página ${pagina} de ${pdfDocument.numPages}`;
        }
        el("documentosZoom").addEventListener("change", () => {
            el("documentosPagina").style.width = `${Number(el("documentosZoom").value) * 100}%`;
        });
        for (const [id, delta] of [["documentosAnterior", -1], ["documentosProxima", 1]]) {
            el(id).addEventListener("click", async () => {
                if (ocupado || !pdfDocument || pagina + delta < 1 || pagina + delta > pdfDocument.numPages) return;
                pagina += delta; bloquear(true);
                try { await renderizarPagina(); }
                catch { limparVisualizacao(); mensagem("Não foi possível exibir a página. Abra o PDF novamente para conferir."); }
                finally { bloquear(false); }
            });
        }
        async function resposta(r) {
            if (!r.ok) {
                let texto = "Não foi possível concluir. Tente novamente.";
                try { texto = (await r.json()).mensagem || texto; } catch {}
                throw new Error(texto);
            }
            return r;
        }
        function renderizar() {
            lista.replaceChildren();
            el("documentosPendentes").setAttribute("aria-pressed", String(aba === "pendente"));
            el("documentosArquivados").setAttribute("aria-pressed", String(aba === "arquivado"));
            const filtrados = docs.filter(d => d.estado === aba);
            for (const doc of filtrados) {
                const item = document.createElement("li"), titulo = document.createElement("strong"), info = document.createElement("small");
                titulo.textContent = doc.nome_original;
                info.textContent = `${new Date(doc.finalizado_em || doc.criado_em).toLocaleString("pt-BR")} · ${(doc.tamanho_bytes / 1024).toFixed(0)} KB · ${doc.estado === "pendente" ? "Aguardando conferência" : "Arquivado"}`;
                const botao = document.createElement("button"); botao.type = "button";
                botao.textContent = aba === "pendente" ? "Conferir PDF" : "Ver PDF";
                botao.addEventListener("click", () => visualizar(doc));
                item.append(titulo, info, botao); lista.append(item);
            }
            mensagem(filtrados.length ? `${filtrados.length} documento(s).` : aba === "pendente" ? "Nenhum PDF aguardando conferência." : "Nenhum PDF arquivado.");
        }
        async function carregar() {
            const ticket = geracao;
            const r = await resposta(await fetch(`/api/pacientes/${paciente}/documentos`, { cache: "no-store" }));
            const result = await r.json(); if (ticket !== geracao) return;
            docs = result.documentos; renderizar();
        }
        async function visualizar(doc) {
            if (ocupado) return;
            limparVisualizacao(); bloquear(true); mensagem("Abrindo PDF para conferência…");
            try {
                const r = await resposta(await fetch(`/api/pacientes/${paciente}/documentos/${doc.id}/conferir`, { cache: "no-store" }));
                const hash = r.headers.get("X-Document-SHA256");
                const buffer = await r.arrayBuffer();
                const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), b => b.toString(16).padStart(2,"0")).join("");
                if (hash !== digest || hash !== doc.sha256) throw new Error("Falha ao conferir a integridade do PDF.");
                blobUrl = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
                el("documentosAbrir").href = blobUrl;
                const pdfjs = await import("/assets/pdfjs/build/pdf.mjs");
                pdfjs.GlobalWorkerOptions.workerSrc = "/assets/pdfjs/build/pdf.worker.mjs";
                pdfTask = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false,
                    standardFontDataUrl: "/assets/pdfjs/standard_fonts/", wasmUrl: "/assets/pdfjs/wasm/", cMapUrl: "/assets/pdfjs/cmaps/", cMapPacked: true });
                pdfDocument = await pdfTask.promise;
                await renderizarPagina();
                el("documentosConferenciaNome").textContent = doc.nome_original;
                el("documentosConferenciaTitulo").textContent = doc.estado === "pendente" ? "Conferir digitalização" : "Documento arquivado";
                el("documentosConfirmacao").hidden = doc.estado !== "pendente" && !doc.limpeza_pendente;
                el("documentosFinalizar").textContent = doc.estado === "pendente" ? "Finalizar e arquivar" : "Liberar cópia temporária";
                el("documentosConferencia").hidden = false; selecionado = { ...doc, sha256: hash };
                mensagem(doc.estado === "pendente" ? "Percorra todas as páginas e confira a digitalização antes de finalizar. Se precisar, envie um novo PDF." : "PDF recuperado do arquivo definitivo.");
            } catch (e) { limparVisualizacao(); mensagem(e.message); }
            finally { bloquear(false); }
        }
        for (const [id, estado] of [["documentosPendentes","pendente"],["documentosArquivados","arquivado"]]) {
            el(id).addEventListener("click", () => { if (ocupado) return; aba = estado; limparVisualizacao(); renderizar(); });
        }
        el("documentosConferido").addEventListener("change", () => { el("documentosFinalizar").disabled = ocupado || !selecionado || !el("documentosConferido").checked; });
        el("documentosFinalizar").addEventListener("click", async () => {
            if (ocupado || !selecionado || !el("documentosConferido").checked) return;
            bloquear(true); mensagem("Arquivando e verificando a cópia definitiva…");
            try {
                const r = await resposta(await fetch(`/api/pacientes/${paciente}/documentos/${selecionado.id}/finalizar`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conferido: true, sha256: selecionado.sha256 })
                }));
                const result = await r.json(); limparVisualizacao(); aba = "arquivado"; await carregar();
                mensagem(result.documento.limpeza_pendente ? "PDF arquivado. A cópia temporária foi mantida. Abra o documento em Arquivados para tentar liberar o espaço novamente." : "PDF conferido e arquivado. A cópia temporária foi removida.");
            } catch (e) { mensagem(e.message); }
            finally { bloquear(false); }
        });
        el("documentosFechar").addEventListener("click", () => { if (!ocupado) dialog.close(); });
        dialog.addEventListener("cancel", e => { if (ocupado) e.preventDefault(); });
        dialog.addEventListener("close", () => { paciente = null; geracao++; docs = []; lista.replaceChildren(); arquivo.value = ""; limparVisualizacao(); origemFoco?.focus(); });
        document.addEventListener("click", async event => {
            const botao = event.target.closest("[data-documentos-paciente]"); if (!botao || dialog.open) return;
            origemFoco = botao; paciente = botao.dataset.documentosPaciente; geracao++; aba = "pendente";
            el("documentosPaciente").textContent = botao.dataset.documentosNome || "Paciente";
            arquivo.value = ""; dialog.showModal(); bloquear(true); mensagem("Carregando documentos…");
            try { await carregar(); } catch (e) { mensagem(e.message); } finally { bloquear(false); }
        });
        el("documentosForm").addEventListener("submit", async event => {
            event.preventDefault(); if (ocupado || !paciente) return;
            const file = arquivo.files[0];
            if (!file || !/\.pdf$/i.test(file.name) || file.size < 1 || file.size > 15 * 1024 * 1024) return mensagem("Selecione um PDF de até 15 MB.");
            bloquear(true); mensagem("Salvando PDF para conferência…");
            try {
                await resposta(await fetch(`/api/pacientes/${paciente}/documentos`, { method: "POST", headers: { "Content-Type": "application/pdf", "X-Document-Name": encodeURIComponent(file.name) }, body: file }));
                arquivo.value = ""; limparVisualizacao(); aba = "pendente"; await carregar(); mensagem("PDF salvo para conferência. Ele ainda não foi enviado ao S3.");
            } catch (e) { mensagem(e.message); } finally { bloquear(false); }
        });
    });
})();
