// Local-only, synthetic data preview. Not imported by production.
process.env.KAHENNA_SUPABASE_URL="https://example.supabase.co";
process.env.KAHENNA_SUPABASE_KEY="test-only-placeholder";
const express=require("express"),path=require("path");
const {fake,paciente,usuario}=require("./helpers.cjs");
const app=express();
app.use((req,res,next)=>{req.usuario=usuario;next();});
app.get("/api/auth/session",(req,res)=>res.json({usuario:{...usuario,papel:"administrador"}}));
app.get("/api/leads",(req,res)=>res.json([{visitante_id:paciente,nome:"Paciente Fictício - Teste PDF",telefone:"00000000000",criado_em:new Date().toISOString(),status:"novo"}]));
const objetosS3Ficticios=new Map();
const arquivoS3Ficticio={async gravar(chave,buffer){objetosS3Ficticios.set(chave,buffer);return {bucket:"preview-ficticio",chave,versao:"v1"};},async baixar(a){return objetosS3Ficticios.get(a.chave_s3);}};
app.use("/api/pacientes",require("../routes/documentos")(fake(),undefined,arquivoS3Ficticio));
for(const pasta of ["build","standard_fonts","wasm","cmaps"])app.use("/assets/pdfjs/"+pasta,express.static(path.join(__dirname,"../node_modules/pdfjs-dist",pasta)));
app.get("/api/financeiro/*path",(req,res)=>res.json([]));
app.get("/api/agendamentos",(req,res)=>res.json([]));
app.use(express.static(path.join(__dirname,"../public")));
app.listen(3099,"127.0.0.1",()=>console.log("Prévia com dados fictícios em http://127.0.0.1:3099/leads.html"));
