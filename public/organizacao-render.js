'use strict';
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tons=[['#f2e1e8','#986176'],['#e5eee5','#66846b'],['#e7e4f3','#82709b'],['#f4e8d8','#a28355'],['#e0edf1','#648793'],['#f4e2dc','#a47769'],['#e9edda','#7e8860'],['#e7e7ef','#777a93']];
 const papel='<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 1h10l7 7v18H4zM14 1v8h7M8 14h9M8 18h9M8 22h6"/></svg>';
 window.KahennaOrganizacaoRender={
  fornecedores:r=>{
   const partes=String(r.nome||'').trim().split(/\s+/),iniciais=partes.slice(0,2).map(p=>Array.from(p)[0]||'').join('').toLocaleUpperCase('pt-BR'),digitos=String(r.telefone||'').replace(/\D/g,''),wa=/^\d{10,13}$/.test(digitos)?'https://wa.me/'+(digitos.length<12?'55':'')+digitos:null;
   return `<article class="org-contact ${r.ativo?'':'is-inactive'}"><div class="org-contact-main"><span class="org-contact-avatar" aria-hidden="true">${esc(iniciais)}</span><div><div class="org-contact-title"><h2>${esc(r.nome)}</h2>${wa?`<a class="org-whatsapp" href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="Conversar com ${esc(r.nome)} no WhatsApp" title="WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>`:''}</div><small>${esc([r.categoria,r.contato,!r.ativo?'Inativo':''].filter(Boolean).join(' · '))}</small></div></div><div class="org-contact-info">${r.email?`<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`:''}</div><div class="org-contact-actions"><button type="button" class="org-edit-icon" data-org-editar="${esc(r.id)}" aria-label="Editar fornecedor ${esc(r.nome)}" title="Editar fornecedor"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></div>${r.observacao?`<p class="org-contact-note">${esc(r.observacao)}</p>`:''}</article>`;
  },
  arquivos:(r,i=0)=>{const [tom,cor]=tons[i%tons.length],ext=(r.nome_original||'arquivo').split('.').pop().slice(0,6).toUpperCase();return `<article class="org-file-card" style="--arquivo-tom:${tom};--arquivo-cor:${cor}"><header><span class="org-file-icon">${papel}</span><span class="org-file-kind">${esc(ext)}</span></header><h2>${esc(r.titulo)}</h2><small>${esc(r.categoria)}</small><footer><span>${new Date(r.criado_em).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span><a class="crm-button" href="/api/organizacao/arquivos/${esc(r.id)}/baixar" download>Baixar</a></footer></article>`;}
 };
})();
