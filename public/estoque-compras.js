'use strict';
window.StockCompras=(()=>{
 const $=id=>document.getElementById(id),base=['un','ml','g'],money=(v,n=2)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:n}),q=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:3});
 const modelos=[['Luvas Látex','caixa'],['Luvas Nitrílicas','caixa'],['Máscara','caixa'],['Touca','pacote'],['Gaze','pacote'],['Algodão','pacote'],['Seringa','caixa'],['Agulha Hipodérmica','caixa'],['Microcânula','caixa'],['Avental descartável','pacote'],['Lençol descartável','pacote'],['Campo descartável','pacote'],['Sapatilha descartável','pacote'],['Coletor de perfurocortantes','un']];
 const normalizar=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 let produto,operacao,produtoId,retorno,salvando=false,foco,existente=null,modeloTicket=0;
 const erro=m=>{$('produtoErro').textContent=m;$('produtoErro').hidden=false;};
 function unidade(){return $('converterSaldo').checked?$('conversaoUnidade').value:$('produtoUnidade').value;}
 function ajustar(){const compra=$('produtoComCompra').checked,conversao=$('converterSaldo').checked;
  $('produtoCompra').hidden=!compra;$('produtoCompra').disabled=!compra;$('camposConversao').hidden=!conversao;$('conversaoResumo').hidden=!conversao;$('conversaoConteudo').disabled=!conversao;$('conversaoUnidade').disabled=!conversao;
  $('conversaoConteudo').required=conversao;for(const id of ['compraQuantidade','compraData'])$(id).required=compra;
  const u=unidade(),pacote=$('compraEmbalagem').value,emb=['caixa','pacote','frasco'].includes(pacote);
  for(const op of $('compraEmbalagem').options)op.disabled=!['caixa','pacote','frasco',u,...(u==='ml'?['l']:u==='g'?['kg']:[])].includes(op.value);
  if($('compraEmbalagem').selectedOptions[0]?.disabled)$('compraEmbalagem').value=u;
  $('compraConteudoLabel').hidden=!emb;$('compraConteudo').required=compra&&emb;
  $('compraConteudoLabel').firstChild.textContent=(u==='un'?'Unidades':u==='ml'?'Mililitros':'Gramas')+' por embalagem';
  const fator=emb?Number($('compraConteudo').value):['l','kg'].includes($('compraEmbalagem').value)?1000:1,quantidade=Number($('compraQuantidade').value)*fator,total=$('compraValor').value!==''?Number($('compraValor').value):$('compraCusto').value!==''?Math.round(quantidade*Number($('compraCusto').value)*100)/100:null;
  $('compraUnidades').textContent=quantidade>0?q(quantidade)+' '+u:'—';$('compraCustoCalculado').textContent=quantidade>0&&total!==null?money(total/quantidade,8)+' / '+u:'—';$('compraTotal').textContent=total!==null?money(total):'—';
  if(conversao)$('conversaoResumo').textContent='Saldo convertido: '+q(Number(produto?.quantidade||0)*Number($('conversaoConteudo').value||0))+' '+u+' · Valor preservado: '+money(produto?.valor_estoque||0);
 }
 function abrir(p,comprar,callback){produto=p;operacao=crypto.randomUUID();produtoId=p?.id||crypto.randomUUID();retorno=callback;if(!$('produtoDialog').open)foco=document.activeElement;existente=null;++modeloTicket;
  $('produtoForm').reset();$('produtoErro').hidden=true;$('produtoTitulo').textContent=comprar?'Registrar compra':p?'Editar produto':'Novo produto';$('produtoSalvar').textContent='Salvar';
  $('produtoModeloLabel').hidden=!!p;$('produtoExistente').hidden=true;
  $('produtoNome').value=p?.nome||'';$('produtoCategoria').value=p?.categoria||'';$('produtoMinimo').value=p?.estoque_minimo||0;$('produtoUnidade').value=p?.unidade||'un';$('produtoUnidade').disabled=!!p;
  $('produtoComCompra').checked=comprar||!p;$('produtoComCompra').disabled=comprar;
  const antigo=p&&!base.includes(p.unidade);$('produtoConversao').hidden=!antigo;$('converterSaldo').checked=!!(antigo&&comprar);$('converterSaldo').disabled=!!(antigo&&comprar);
  $('compraEmbalagem').value=p?.embalagem_padrao||p?.unidade||'un';$('compraConteudo').value=p?.conteudo_padrao||1;
  $('compraData').value=window.KahennaAniversarios.hojeBrasil();$('compraData').max=$('compraData').value;
  $('produtoArquivar').hidden=!p||comprar;$('produtoArquivar').textContent='Excluir produto';
  ajustar();if(!$('produtoDialog').open)$('produtoDialog').showModal();
 }
 async function escolherModelo(){const valor=$('produtoModelo').value;abrir(null,false,retorno);$('produtoModelo').value=valor;if(valor==='')return;const modelo=modelos[Number(valor)];if(!modelo)return;
  $('produtoNome').value=modelo[0];$('produtoCategoria').value='Descartáveis';$('produtoUnidade').value='un';$('compraEmbalagem').value=modelo[1];$('compraConteudo').value=modelo[1]==='un'?1:'';ajustar();
  const ticket=++modeloTicket;try{const r=await fetch('/api/estoque/painel?'+new URLSearchParams({busca:modelo[0]}),{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return;const d=await r.json();if(ticket!==modeloTicket)return;existente=d.produtos?.find(p=>normalizar(p.nome)===normalizar(modelo[0]))||null;conferirExistente();}catch{/* The form remains usable if the optional lookup is unavailable. */}
 }
 function conferirExistente(){const igual=existente&&!produto&&normalizar($('produtoNome').value)===normalizar(existente.nome);$('produtoExistente').hidden=!igual;if(igual)$('produtoExistenteNome').textContent=existente.nome+' · Já cadastrado';}
 async function salvar(e){e.preventDefault();if(salvando)return;$('produtoErro').hidden=true;
  if(existente&&!produto&&normalizar($('produtoNome').value)===normalizar(existente.nome))return erro('Este produto já está cadastrado. Selecione Adicionar compra ou altere o nome para cadastrar uma variação.');
  if(produto&&!base.includes(produto.unidade)&&$('produtoComCompra').checked&&!$('converterSaldo').checked)return erro('Informe o conteúdo da embalagem para controlar esta compra por unidade.');
  if($('produtoComCompra').checked&&$('compraValor').value===''&&$('compraCusto').value==='')return erro('Informe o valor da compra ou o custo por unidade.');
  const body={id:operacao,produto_id:produtoId,novo:!produto,revisao:produto?.revisao,cadastro:{nome:$('produtoNome').value.trim(),categoria:$('produtoCategoria').value.trim(),unidade:$('produtoUnidade').value,estoque_minimo:$('produtoMinimo').value},conversao:$('converterSaldo').checked?{unidade:$('conversaoUnidade').value,fator:$('conversaoConteudo').value}:null,compra:$('produtoComCompra').checked?{quantidade:$('compraQuantidade').value,unidade_compra:$('compraEmbalagem').value,conteudo_embalagem:$('compraConteudoLabel').hidden?1:$('compraConteudo').value,valor_total:$('compraValor').value,custo_unitario:$('compraCusto').value,ocorrido_em:$('compraData').value,fornecedor:$('compraFornecedor').value,lote:$('compraLote').value,validade:$('compraValidade').value}:null};
  salvando=true;const controles=[...$('produtoDialog').querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controles.forEach(([el])=>el.disabled=true);
  try{const r=await fetch('/api/estoque/cadastros',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});if(r.status===401){location.replace('/login.html');return;}const d=await r.json();if(!r.ok)throw Error(d.mensagem||'Não foi possível salvar.');$('produtoDialog').close();await retorno(body.compra?'Produto e compra salvos.':'Produto salvo.');}
  catch(e){erro(e.message);}finally{salvando=false;controles.forEach(([el,disabled])=>el.disabled=disabled);}
 }
 function init(){modelos.forEach((m,i)=>$('produtoModelo').add(new Option(m[0],String(i))));$('produtoModelo').addEventListener('change',escolherModelo);$('produtoNome').addEventListener('input',conferirExistente);$('produtoExistenteCompra').addEventListener('click',()=>{if(existente&&!salvando)abrir(existente,true,retorno);});$('produtoForm').addEventListener('input',ajustar);$('produtoForm').addEventListener('change',ajustar);$('produtoForm').addEventListener('submit',salvar);$('produtoDialog').addEventListener('cancel',e=>{if(salvando)e.preventDefault();});$('produtoDialog').addEventListener('close',()=>{++modeloTicket;foco?.focus();});$('produtoDialog').querySelectorAll('[data-fechar]').forEach(b=>b.addEventListener('click',e=>{if(salvando)e.stopImmediatePropagation();},true));}
 return {abrir,init};
})();
