'use strict';
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
const {adapter,usuario,paciente}=require('./estoque-local-db.cjs');
async function preparar(){
 const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 grant usage on schema public,auth to service_role;`);
 for(const file of ['database/schema.sql','database/documentos-privados.sql','supabase/migrations/20261026153721_documentos_conferencia_financeiro.sql',...['20261026130322_estoque.sql','20261103013557_estoque_exclusao_recuperavel.sql','20261103015409_estoque_recriar_produto_excluido.sql','20261103023124_estoque_compras_lotes_atendimentos.sql','20261107230414_caixa_clinica_taxas.sql'].map(f=>'supabase/migrations/'+f)])await pg.exec(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
 await pg.query('insert into auth.users values($1)',[usuario]);
 await pg.query("insert into visitantes(visitante_id,nome,telefone) values($1,'Paciente fictício','11999990000')",[paciente]);
 await pg.exec('set role service_role');return pg;
}
module.exports={preparar,adapter,usuario,paciente};
