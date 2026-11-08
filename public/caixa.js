'use strict';
(() => {
    const $ = id => document.getElementById(id);
    const moeda = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const state = { pagina: 0, tipo: 'entradas', consulta: 0, linhas: [], registro: null, excluir: null, taxas: {}, revisaoTaxas: 0, salvando: false };
    let buscaTimer, foco;
    async function api(caminho, opcoes = {}) {
        const resposta = await fetch('/api/caixa' + caminho, {
            cache: 'no-store', ...opcoes,
            headers: { Accept: 'application/json', ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}) }
        });
        if (resposta.status === 401) { location.replace('/login.html'); throw Error('Entre novamente.'); }
        const data = await resposta.json();
        if (!resposta.ok) throw Error(data.mensagem || 'Não foi possível atualizar o caixa.');
        return data;
    }
    function feedback(texto, erro = false) {
        $('caixaFeedback').textContent = texto;
        $('caixaFeedback').classList.toggle('error', erro);
        $('caixaFeedback').hidden = false;
    }
    function abrir(dialog) {
        foco = document.activeElement;
        dialog.showModal();
        dialog.querySelector('input,select,button')?.focus();
    }
    function erroFormulario(id, erro) {
        $(id).textContent = erro.message;
        $(id).hidden = false;
    }
    function travar(dialog, ocupado) {
        state.salvando = ocupado;
        dialog.querySelectorAll('button').forEach(button => { button.disabled = ocupado; });
    }
    function detalhes(linha) {
        const d = linha.detalhes || {};
        if (state.tipo === 'entradas') {
            const nomes = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', maquininha: 'Maquininha', link: 'Link' };
            const partes = [nomes[d.forma_pagamento], d.forma_pagamento === 'credito' ? d.parcelas + 'x' : '', d.bandeira, nomes[d.canal_pagamento]];
            if (Number(d.taxa_valor) > 0) partes.push('Taxa ' + moeda(d.taxa_valor));
            return partes.filter(Boolean).join(' · ');
        }
        return [linha.categoria, d.quantidade ? Number(d.quantidade).toLocaleString('pt-BR') + ' ' + (d.unidade || '') : '', d.fornecedor].filter(Boolean).join(' · ');
    }
    function renderizar(data) {
        $('caixaEntradas').textContent = moeda(data.entradas_liquidas);
        $('caixaGastos').textContent = moeda(data.gastos);
        $('caixaResultado').textContent = moeda(data.resultado);
        $('caixaResultado').closest('article').classList.toggle('is-negative', Number(data.resultado) < 0);
        $('caixaTaxasPendentes').hidden = !data.taxas_pendentes;
        $('caixaTaxasPendentes').textContent = data.taxas_pendentes + ' recebimento(s) de cartão sem taxa registrada. O resultado inclui esses valores sem desconto.';
        state.linhas = data.lancamentos;
        $('caixaLista').innerHTML = data.lancamentos.length ? data.lancamentos.map((linha, indice) => {
            const d = linha.detalhes || {};
            const editavel = state.tipo === 'gastos';
            const extra = [d.lote ? 'Lote ' + d.lote : '', d.validade ? 'Validade ' + d.validade.split('-').reverse().join('/') : '', d.observacao, ...(d.nota_itens||[]).map(i=>i.nome+' · '+i.quantidade+' '+i.unidade+' · '+moeda(i.valor)+(i.lote?' · Lote '+i.lote:'')+(i.validade?' · Validade '+i.validade.split('-').reverse().join('/'):''))].filter(Boolean).join(' · ');
            return `<article class="cash-row ${editavel || Number(linha.valor) < 0 ? 'cash-outflow' : 'cash-inflow'}"><time datetime="${esc(linha.dia)}">${esc(linha.dia.split('-').reverse().join('/'))}</time><div class="cash-row-description"><strong>${esc(linha.descricao)}</strong><small>${esc(detalhes(linha))}</small>${extra ? `<details><summary>Detalhes</summary><p>${esc(extra)}</p></details>` : ''}</div><strong class="cash-row-value">${moeda(linha.valor)}</strong>${editavel ? `<div class="cash-row-actions">${linha.origem === 'despesa' ? `<button type="button" data-caixa-editar="${indice}" aria-label="Editar ${esc(linha.descricao)}" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>` : ''}<button type="button" data-caixa-excluir="${indice}" aria-label="Excluir ${esc(linha.descricao)}" title="Excluir"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div>` : ''}</article>`;
        }).join('') : '<div class="stock-empty"><strong>' + (state.tipo === 'gastos' ? 'Nenhuma compra ou despesa neste período' : 'Nenhuma entrada neste período') + '</strong></div>';
        $('caixaPaginacao').hidden = data.total <= 10;
        $('caixaPagina').textContent = 'Página ' + (state.pagina + 1) + ' de ' + Math.max(1, Math.ceil(data.total / 10));
        $('caixaAnterior').disabled = state.pagina === 0;
        $('caixaProxima').disabled = (state.pagina + 1) * 10 >= data.total;
    }
    async function carregar() {
        const ticket = ++state.consulta;
        $('caixaLista').setAttribute('aria-busy', 'true');
        try {
            const params = new URLSearchParams({ mes: $('caixaMes').value, tipo: state.tipo, pagina: state.pagina, busca: $('caixaBusca').value });
            const data = await api('/painel?' + params);
            if (ticket !== state.consulta) return;
            if (state.pagina > 0 && state.pagina * 10 >= data.total) { state.pagina = 0; return carregar(); }
            renderizar(data);
        } catch (erro) {
            if (ticket !== state.consulta) return;
            for (const id of ['caixaEntradas', 'caixaGastos', 'caixaResultado']) $(id).textContent = '—';
            $('caixaLista').innerHTML = '<div class="stock-empty"><strong>Não foi possível carregar este período.</strong></div>';
            feedback(erro.message, true);
        } finally {
            if (ticket === state.consulta) $('caixaLista').removeAttribute('aria-busy');
        }
    }
    function editar(tipo, linha = null) {
        state.registro = { id: linha?.id || crypto.randomUUID(), tipo, revisao: linha?.detalhes.revisao ?? null };
        $('caixaForm').reset();
        $('caixaErro').hidden = true;
        $('caixaDialogTitulo').textContent = linha ? 'Editar lançamento' : tipo === 'compra' ? 'Registrar compra' : 'Nova despesa';
        $('caixaDescricao').value = linha?.descricao || '';
        $('caixaValor').value = linha?.valor ?? '';
        $('caixaData').value = linha?.dia || window.KahennaAniversarios.hojeBrasil();
        $('caixaData').max = window.KahennaAniversarios.hojeBrasil();
        $('caixaCategoria').value = linha?.categoria || (tipo === 'compra' ? 'Produtos' : 'Aluguel');
        const d = linha?.detalhes || {};
        for (const [campo, chave] of [['caixaQuantidade', 'quantidade'], ['caixaUnidade', 'unidade'], ['caixaFornecedor', 'fornecedor'], ['caixaLote', 'lote'], ['caixaValidade', 'validade'], ['caixaObservacao', 'observacao']]) $(campo).value = d[chave] ?? '';
        $('caixaDetalhesCompra').hidden = tipo !== 'compra';
        $('caixaDetalhesCompra').open = Boolean(d.quantidade || d.lote || d.validade);
        abrir($('caixaDialog'));
        $('caixaDescricao').focus();
    }
    async function salvar(evento) {
        evento.preventDefault();
        if (state.salvando) return;
        const dialog = $('caixaDialog');
        const payload = { ...state.registro };
        for (const [campo, chave] of [['caixaDescricao', 'descricao'], ['caixaValor', 'valor'], ['caixaData', 'data_pagamento'], ['caixaCategoria', 'categoria'], ['caixaQuantidade', 'quantidade'], ['caixaUnidade', 'unidade'], ['caixaFornecedor', 'fornecedor'], ['caixaLote', 'lote'], ['caixaValidade', 'validade'], ['caixaObservacao', 'observacao']]) payload[chave] = $(campo).value;
        travar(dialog, true);
        $('caixaErro').hidden = true;
        try {
            await api('/despesas', { method: 'POST', body: JSON.stringify(payload) });
            dialog.close();
            state.pagina = 0;
            feedback('Pagamento salvo no caixa.');
            await carregar();
        } catch (erro) { erroFormulario('caixaErro', erro); }
        finally { travar(dialog, false); }
    }
    function capturarTaxas() {
        document.querySelectorAll('[data-caixa-taxa]').forEach(input => {
            if (input.value === '') delete state.taxas[input.dataset.caixaTaxa];
            else state.taxas[input.dataset.caixaTaxa] = Number(input.value);
        });
    }
    function desenharTaxas(atualizarGrupos = false) {
        const canal = $('caixaTaxasCanal').value;
        if (atualizarGrupos) $('caixaTaxasGrupo').innerHTML = canal === 'link' ? '<option value="todas">Visa, Mastercard, Elo e Amex</option><option value="outras">Outras bandeiras</option>' : '<option value="visa_mastercard">Visa e Mastercard</option><option value="elo_amex">Elo e Amex</option><option value="outras">Outras bandeiras</option>';
        const grupo = $('caixaTaxasGrupo').value;
        const campos = canal === 'maquininha' ? [['debito', 1, 'Débito']] : [];
        for (let n = 1; n <= 6; n++) campos.push(['credito', n, 'Crédito ' + n + 'x']);
        $('caixaTaxasCampos').innerHTML = campos.map(([forma, n, label]) => {
            const chave = canal + ':' + grupo + ':' + forma + ':' + n;
            return `<label>${label}<span><input type="number" min="0" max="100" step="0.0001" inputmode="decimal" data-caixa-taxa="${chave}" value="${state.taxas[chave] ?? ''}" aria-label="Taxa de ${label}"><small>%</small></span></label>`;
        }).join('');
    }
    async function abrirTaxas() {
        $('caixaTaxasErro').hidden = true;
        $('caixaAbrirTaxas').disabled = true;
        try {
            const c = await api('/taxas');
            state.taxas = { ...c.taxas };
            state.revisaoTaxas = c.revisao;
            desenharTaxas(true);
            abrir($('caixaTaxasDialog'));
        } catch (erro) { feedback(erro.message, true); }
        finally { $('caixaAbrirTaxas').disabled = false; }
    }
    document.addEventListener('DOMContentLoaded', () => {
        fetch('/api/organizacao/fornecedores',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(!d)return;const lista=document.createElement('datalist');lista.id='caixaFornecedores';lista.innerHTML=d.fornecedores.filter(f=>f.ativo).map(f=>'<option value="'+esc(f.nome)+'">').join('');document.body.append(lista);for(const id of ['caixaFornecedor','notaFornecedor'])document.getElementById(id)?.setAttribute('list',lista.id);}).catch(()=>{});
        $('caixaMes').value = window.KahennaAniversarios.hojeBrasil().slice(0, 7);
        $('caixaNovaCompra').addEventListener('click', () => editar('compra'));
        $('caixaNovaDespesa').addEventListener('click', () => editar('despesa'));
        $('caixaForm').addEventListener('submit', salvar);
        $('caixaAtualizar').addEventListener('click', carregar);
        $('caixaMes').addEventListener('change', () => { state.pagina = 0; carregar(); });
        $('caixaBusca').addEventListener('input', () => { clearTimeout(buscaTimer); buscaTimer = setTimeout(() => { state.pagina = 0; carregar(); }, 150); });
        document.querySelectorAll('[data-caixa-tipo]').forEach(button => button.addEventListener('click', () => {
            state.tipo = button.dataset.caixaTipo; state.pagina = 0;
            document.querySelectorAll('[data-caixa-tipo]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
            carregar();
        }));
        for (const [id, delta] of [['caixaAnterior', -1], ['caixaProxima', 1]]) $(id).addEventListener('click', () => { state.pagina = Math.max(0, state.pagina + delta); carregar(); });
        document.querySelectorAll('[data-caixa-fechar]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
        document.querySelectorAll('dialog.cash-dialog').forEach(dialog => {
            dialog.addEventListener('cancel', evento => { if (state.salvando) evento.preventDefault(); });
            dialog.addEventListener('close', () => foco?.focus({ preventScroll: true }));
        });
        $('caixaLista').addEventListener('click', evento => {
            const edit = evento.target.closest('[data-caixa-editar]');
            if (edit) { const linha = state.linhas[Number(edit.dataset.caixaEditar)]; return editar(linha.tipo, linha); }
            const excluir = evento.target.closest('[data-caixa-excluir]');
            if (!excluir) return;
            state.excluir = state.linhas[Number(excluir.dataset.caixaExcluir)];
            $('caixaExcluirNome').textContent = state.excluir.descricao + ' · ' + moeda(state.excluir.valor);
            $('caixaExcluirErro').hidden = true;
            abrir($('caixaExcluirDialog'));
        });
        $('caixaExcluirConfirmar').addEventListener('click', async () => {
            if (state.salvando) return;
            const dialog = $('caixaExcluirDialog');
            travar(dialog, true);
            try {
                await api('/excluir', { method: 'POST', body: JSON.stringify({ id: state.excluir.id, origem: state.excluir.origem, revisao: state.excluir.detalhes.revisao }) });
                dialog.close(); feedback('Lançamento retirado dos gastos.'); await carregar();
            } catch (erro) { erroFormulario('caixaExcluirErro', erro); }
            finally { travar(dialog, false); }
        });
        $('caixaAbrirTaxas').addEventListener('click', abrirTaxas);
        $('caixaTaxasCanal').addEventListener('change', () => { capturarTaxas(); desenharTaxas(true); });
        $('caixaTaxasGrupo').addEventListener('change', () => { capturarTaxas(); desenharTaxas(); });
        $('caixaTaxasForm').addEventListener('submit', async evento => {
            evento.preventDefault();
            if (state.salvando) return;
            capturarTaxas();
            const dialog = $('caixaTaxasDialog');
            travar(dialog, true); $('caixaTaxasErro').hidden = true;
            try {
                await api('/taxas', { method: 'PUT', body: JSON.stringify({ taxas: state.taxas, revisao: state.revisaoTaxas }) });
                dialog.close(); feedback('Taxas salvas para os próximos recebimentos.'); await carregar();
            } catch (erro) { erroFormulario('caixaTaxasErro', erro); }
            finally { travar(dialog, false); }
        });
        carregar();
    });
})();
