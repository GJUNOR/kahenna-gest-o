'use strict';
process.env.KAHENNA_SUPABASE_URL='https://example.supabase.co';process.env.KAHENNA_SUPABASE_KEY='test-only-placeholder';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {renderizarPagina,PAGINAS}=require('../middleware/paginas');
const ler=nome=>fs.readFileSync(path.join(__dirname,'../public',nome),'utf8');
test('menu canônico mostra cinco abas ao administrador desde o HTML inicial em qualquer página',()=>{
 for(const pagina of PAGINAS){const html=renderizarPagina(ler(pagina),'administrador',pagina);const nav=html.match(/<nav class="menu"[^>]*>([\s\S]*?)<\/nav>/)[1];
 assert.equal((nav.match(/<a /g)||[]).length,5,pagina);assert.equal((nav.match(/aria-current="page"/g)||[]).length,1,pagina);
 assert.match(html,/<body[^>]*data-crm-role="administrador"/);for(const link of nav.match(/<a[^>]+>/g))assert.doesNotMatch(link,/\shidden(?=[\s>])/);
 assert.match(nav,new RegExp('href="/'+pagina.replace('.','\\.')+'" class="active" aria-current="page"'));
 }
});
test('o menu mantém abas administrativas ocultas para secretária e não altera outros estados hidden',()=>{
 for(const role of ['secretaria','',null,'administrador<script>']){const html=renderizarPagina(ler('agenda.html'),role,'agenda.html');const links=html.match(/<a[^>]*data-admin-only[^>]*>/g);assert.equal(links.length,2);links.forEach(link=>assert.match(link,/\shidden(?=[\s>])/));assert.match(html,/<body[^>]*data-crm-role="secretaria"/);assert.match(html,/id="modalAgendamento" hidden/);}
});
test('todas as páginas privadas carregam uma vez a mesma fonte, sessão e camada final de layout',()=>{
 for(const pagina of PAGINAS){const html=ler(pagina);assert.equal((html.match(/src="\/session-ui.js\?v=2"/g)||[]).length,1,pagina);assert.match(html,/<body[^>]*class="[^"]*crm-page/);const head=html.split('</head>')[0];assert.equal((head.match(/fonts.googleapis.com\/css2\?family=Inter:wght@400;500;600;700&amp;display=swap/g)||[]).length,1,pagina);const styles=[...head.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)];assert.match(styles.at(-1)[0],/crm-layout.css\?v=\d+/);}
});
test('as cinco páginas continuam protegidas no servidor sem sessão',async()=>{
 const app=require('../server'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{for(const pagina of PAGINAS){const r=await fetch(`http://127.0.0.1:${server.address().port}/${pagina}`,{redirect:'manual'});assert.equal(r.status,302,pagina);assert.match(r.headers.get('location'),/^\/login.html\?destino=/);assert.equal(r.headers.get('cache-control'),'no-store');}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
