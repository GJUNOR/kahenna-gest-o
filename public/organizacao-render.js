'use strict';
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tons={'Fichas e modelos':['#f4e8ef','#96657d'],'Termos e autorizações':['#f4eee2','#a38a63'],Protocolos:['#e9eff0','#668a91'],Administrativo:['#eeeaf3','#8a779e'],Outros:['#f0edeb','#948379']};
 const papel='<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 1h10l7 7v18H4zM14 1v8h7M8 14h9M8 18h9M8 22h6"/></svg>';
 window.KahennaOrganizacaoRender={
  fornecedores:r=>{
   const partes=String(r.nome||'').trim().split(/\s+/),iniciais=partes.slice(0,2).map(p=>Array.from(p)[0]||'').join('').toLocaleUpperCase('pt-BR'),digitos=String(r.telefone||'').replace(/\D/g,''),wa=/^\d{10,13}$/.test(digitos)?'https://wa.me/'+(digitos.length<12?'55':'')+digitos:null;
   return `<article class="org-contact ${r.ativo?'':'is-inactive'}"><div class="org-contact-main"><span class="org-contact-avatar" aria-hidden="true">${esc(iniciais)}</span><div><h2>${esc(r.nome)}</h2><small>${esc([r.categoria,r.contato,!r.ativo?'Inativo':''].filter(Boolean).join(' · '))}</small></div></div><div class="org-contact-info">${r.telefone?`<a href="tel:${digitos}">${esc(r.telefone)}</a>`:''}${r.email?`<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`:''}</div><div class="org-contact-actions">${wa?`<a class="crm-button" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`:''}<button type="button" class="crm-button" data-org-editar="${esc(r.id)}">Editar</button></div>${r.observacao?`<p class="org-contact-note">${esc(r.observacao)}</p>`:''}</article>`;
  },
  arquivos:r=>{const [tom,cor]=tons[r.categoria]||tons.Outros,ext=(r.nome_original||'arquivo').split('.').pop().slice(0,6).toUpperCase();return `<article class="org-file-card" style="--arquivo-tom:${tom};--arquivo-cor:${cor}"><header><span class="org-file-icon">${papel}</span><span class="org-file-kind">${esc(ext)}</span></header><h2>${esc(r.titulo)}</h2><p title="${esc(r.nome_original)}">${esc(r.nome_original)}</p><small>${esc(r.categoria)}</small><footer><span>${Math.ceil(r.tamanho/1024)} KB · ${new Date(r.criado_em).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span><a class="crm-button" href="/api/organizacao/arquivos/${esc(r.id)}/baixar" download>Baixar</a></footer></article>`;}
 };
})();
