"use strict";
process.env.KAHENNA_SUPABASE_URL = "https://example.supabase.co";
process.env.KAHENNA_SUPABASE_KEY = "test-only-placeholder";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { criarServico, validarPDF, MAX_BYTES, BUCKET } = require("../services/documentos");
const criarRotas = require("../routes/documentos");
const { exigirAdministradorApi, exigirAutenticacaoApi } = require("../middleware/auth");
const {fake,paciente,outro,usuario,pdf}=require("./helpers.cjs");
test("valida conteúdo PDF, tamanho e nomes seguros", () => {
    validarPDF(pdf,"prontuário.pdf");
    for (const [body,name] of [[Buffer.alloc(0),"x.pdf"],[Buffer.from("fake"),"x.pdf"],[pdf,"../x.pdf"],[pdf,"x.pdf.exe"],[pdf,"x\r\n.pdf"],[Buffer.alloc(MAX_BYTES+1),"x.pdf"]]) assert.throws(()=>validarPDF(body,name));
});
test("envio, listagem e download preservam bytes e não expõem caminho", async () => {
    const client=fake(), service=criarServico(client);
    const doc=await service.enviar(paciente,usuario,pdf,"teste.pdf");
    const lista=await service.listar(paciente,usuario);
    assert.equal(lista.length,1); assert.equal(lista[0].caminho,undefined);
    const baixado=await service.baixar(paciente,doc.id,usuario);
    assert.deepEqual(baixado.buffer,pdf);
    assert.deepEqual(client.audits.map(a=>a.acao),["enviar","listar","baixar"]);
});
test("novos envios não sobrescrevem o PDF anterior", async () => {
    const client=fake(), service=criarServico(client);
    const a=await service.enviar(paciente,usuario,pdf,"mesmo-nome.pdf");
    const b=await service.enviar(paciente,usuario,pdf,"mesmo-nome.pdf");
    assert.notEqual(a.id,b.id); assert.equal(client.objects.size,2);
});
test("nega troca de paciente e identificadores inválidos", async () => {
    const service=criarServico(fake()); const doc=await service.enviar(paciente,usuario,pdf,"teste.pdf");
    await assert.rejects(service.baixar(outro,doc.id,usuario), {statusCode:404});
    await assert.rejects(service.enviar(outro,usuario,pdf,"teste.pdf"), {statusCode:404});
    await assert.rejects(service.baixar("../",doc.id,usuario), {statusCode:400});
});
test("falha fechada se bucket público ou registro falhar", async () => {
    const publico=fake({publicBucket:true});
    await assert.rejects(criarServico(publico).enviar(paciente,usuario,pdf,"teste.pdf"),{statusCode:503});
    assert.equal(publico.objects.size,0);
    const erro=fake({registrationFails:true});
    await assert.rejects(criarServico(erro).enviar(paciente,usuario,pdf,"teste.pdf"),{statusCode:503});
    assert.equal(erro.objects.size,0); assert.equal(erro.docs.size,0);
});
test("bloqueia download quando auditoria ou integridade falham", async () => {
    const client=fake(), service=criarServico(client); const doc=await service.enviar(paciente,usuario,pdf,"teste.pdf");
    client.objects.set(doc.caminho,Buffer.from("corrompido"));
    await assert.rejects(service.baixar(paciente,doc.id,usuario),{statusCode:503});
    const outroClient=fake({auditFails:true}), outroService=criarServico(outroClient);
    const outroDoc=await outroService.enviar(paciente,usuario,pdf,"teste.pdf");
    await assert.rejects(outroService.baixar(paciente,outroDoc.id,usuario),{statusCode:503});
});
test("HTTP: autorização, CSRF, MIME, tamanho e download sem cache", async t => {
    const app=express();
    app.use((req,res,next)=>{res.set("Cache-Control","no-store"); if(req.method==='POST' && req.get('origin') && req.get('origin')!=='http://kahenna.test') return res.sendStatus(403); next();});
    app.use((req,res,next)=>{
        const perfil=req.get("X-Test-Role");
        if (!perfil) return res.sendStatus(401);
        req.usuario={...usuario,app_metadata:{ativo:perfil!=="inativo",papel:perfil==="secretaria"?"secretaria":"administrador"}}; next();
    });
    app.use("/api/pacientes",criarRotas(fake()));
    const server=app.listen(0,"127.0.0.1"); await new Promise(r=>server.once("listening",r)); t.after(()=>server.close());
    const base=`http://127.0.0.1:${server.address().port}/api/pacientes/${paciente}/documentos`;
    assert.equal((await fetch(base)).status,401);
    assert.equal((await fetch(base,{headers:{"X-Test-Role":"secretaria"}})).status,403);
    assert.equal((await fetch(base,{headers:{"X-Test-Role":"inativo"}})).status,401);
    const headers={"X-Test-Role":"administrador","Content-Type":"application/pdf","X-Document-Name":"teste.pdf"};
    assert.equal((await fetch(base,{method:"POST",headers:{...headers,Origin:"https://externo.test"},body:pdf})).status,403);
    assert.equal((await fetch(base,{method:"POST",headers:{...headers,"Content-Type":"text/plain"},body:pdf})).status,415);
    assert.equal((await fetch(base,{method:"POST",headers,body:Buffer.alloc(MAX_BYTES+1)})).status,413);
    const upload=await fetch(base,{method:"POST",headers,body:pdf}); assert.equal(upload.status,201);
    const {documento}=await upload.json();
    const download=await fetch(`${base}/${documento.id}/arquivo`,{headers});
    assert.equal(download.status,200); assert.match(download.headers.get("cache-control"),/no-store/);
    assert.match(download.headers.get("content-disposition"),/^attachment/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
});
test("middleware real bloqueia chamadas sem sessão", async () => {
    let status;
    const res={clearCookie(){},status(s){status=s;return this;},json(){return this;}};
    await exigirAutenticacaoApi({headers:{}},res,()=>assert.fail("não deveria autorizar"));
    assert.equal(status,401);
});


