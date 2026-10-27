-- Requires database/schema.sql, database/acessos.sql and database/documentos-privados.sql.
begin;
create table public.documentos_arquivos (
 documento_id uuid primary key references public.documentos_pacientes(id) on delete restrict,
 paciente_id uuid not null references public.visitantes(visitante_id) on delete restrict,
 bucket_s3 text not null check(length(bucket_s3) between 3 and 255),
 chave_s3 text not null unique,
 versao_s3 text not null check(length(versao_s3)>0 and versao_s3<>'null'),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 finalizado_por uuid not null references auth.users(id) on delete restrict,
 finalizado_em timestamptz not null default now(),
 temporario_removido_em timestamptz,
 check(chave_s3='prontuarios/'||paciente_id::text||'/'||documento_id::text||'.pdf')
);
create index documentos_arquivos_paciente_idx on public.documentos_arquivos(paciente_id,finalizado_em desc);
alter table public.documentos_arquivos enable row level security;
revoke all on public.documentos_arquivos from public,anon,authenticated;
grant select,insert on public.documentos_arquivos to service_role;
alter table public.documentos_auditoria drop constraint documentos_auditoria_acao_check;
alter table public.documentos_auditoria add constraint documentos_auditoria_acao_check check(acao in ('enviar','listar','baixar','conferir','finalizar'));
create function public.kahenna_finalizar_documento(p_documento uuid,p_paciente uuid,p_hash text,p_usuario uuid,p_bucket text,p_chave text,p_versao text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.documentos_pacientes; a public.documentos_arquivos;
begin
 -- Serializes concurrent finalization while keeping document metadata immutable.
 perform pg_advisory_xact_lock(hashtextextended(p_documento::text,0));
 select * into d from public.documentos_pacientes where id=p_documento and paciente_id=p_paciente;
 if not found or d.sha256<>p_hash then raise exception 'Documento inválido.'; end if;
 -- Only service_role can execute; Express checks the active administrator on each request.
 select * into a from public.documentos_arquivos where documento_id=p_documento;
 if found then return to_jsonb(a); end if;
 insert into public.documentos_arquivos(documento_id,paciente_id,bucket_s3,chave_s3,versao_s3,sha256,finalizado_por)
 values(p_documento,p_paciente,p_bucket,p_chave,p_versao,p_hash,p_usuario) returning * into a;
 insert into public.documentos_auditoria(documento_id,paciente_id,usuario_id,acao) values(p_documento,p_paciente,p_usuario,'finalizar');
 return to_jsonb(a);
end; $$;
revoke all on function public.kahenna_finalizar_documento(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.kahenna_finalizar_documento(uuid,uuid,text,uuid,text,text,text) to service_role;

create function public.kahenna_confirmar_limpeza_documento(p_documento uuid)
returns void language sql security invoker set search_path='' as $$
 update public.documentos_arquivos set temporario_removido_em=coalesce(temporario_removido_em,now()) where documento_id=p_documento;
$$;
grant update(temporario_removido_em) on public.documentos_arquivos to service_role;
revoke all on function public.kahenna_confirmar_limpeza_documento(uuid) from public,anon,authenticated;
grant execute on function public.kahenna_confirmar_limpeza_documento(uuid) to service_role;

-- Database operations are atomic; reembolsos lock the original receipt.
alter table public.lancamentos_financeiros add column operacao_id uuid;
create unique index lancamentos_operacao_idx on public.lancamentos_financeiros(operacao_id) where operacao_id is not null;
create function public.kahenna_registrar_financeiro(p_paciente uuid,p_dados jsonb,p_usuario uuid,p_operacao uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v numeric; n integer; l public.lancamentos_financeiros; existente public.lancamentos_financeiros;
begin
 -- Authenticated active staff are checked by Express; browser roles cannot execute this RPC.
 if p_operacao is null then raise exception 'Operação inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operacao::text,1));
 select * into existente from public.lancamentos_financeiros where operacao_id=p_operacao;
 if found then
  if existente.visitante_id<>p_paciente or existente.registrado_por_id<>p_usuario or existente.tipo<>'atendimento' or existente.valor<>(p_dados->>'valor')::numeric or existente.descricao<>btrim(p_dados->>'descricao') or existente.forma_pagamento<>p_dados->>'forma_pagamento' or existente.parcelas<>coalesce((p_dados->>'parcelas')::integer,1) or coalesce(existente.observacao,'')<>coalesce(p_dados->>'observacao','') then raise exception 'Operação já utilizada com outros dados.'; end if;
  return jsonb_build_object('lancamento',to_jsonb(existente),'paciente',jsonb_build_object('visitante_id',p_paciente,'status','convertido'));
 end if;
 v:=(p_dados->>'valor')::numeric; n:=coalesce((p_dados->>'parcelas')::integer,1);
 if coalesce(p_dados->>'tipo','')<>'atendimento' or v is null or v<=0 or v>1000000 or v<>round(v,2) or coalesce(length(btrim(p_dados->>'descricao')),0) not between 1 and 200 or coalesce(p_dados->>'forma_pagamento','') not in ('pix','dinheiro','debito','credito') or n not between 1 and 12 then raise exception 'Dados financeiros inválidos.'; end if;
 perform 1 from public.visitantes where visitante_id=p_paciente for update;
 if not found then raise exception 'Paciente não encontrado.'; end if;
 insert into public.lancamentos_financeiros(visitante_id,tipo,descricao,valor,forma_pagamento,parcelas,observacao,registrado_por_id,registrado_por_email,registrado_por_nome,operacao_id)
 values(p_paciente,'atendimento',btrim(p_dados->>'descricao'),v,p_dados->>'forma_pagamento',n,p_dados->>'observacao',p_usuario,p_dados->>'registrado_por_email',p_dados->>'registrado_por_nome',p_operacao) returning * into l;
 update public.visitantes set status='convertido' where visitante_id=p_paciente;
 return jsonb_build_object('lancamento',to_jsonb(l),'paciente',jsonb_build_object('visitante_id',p_paciente,'status','convertido'));
end; $$;
create function public.kahenna_reembolsar_financeiro(p_paciente uuid,p_dados jsonb,p_usuario uuid,p_operacao uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v numeric; o public.lancamentos_financeiros; l public.lancamentos_financeiros; total numeric;
begin
 -- Authenticated active staff are checked by Express; browser roles cannot execute this RPC.
 if p_operacao is null then raise exception 'Operação inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operacao::text,1));
 v:=(p_dados->>'valor')::numeric;
 select * into l from public.lancamentos_financeiros where operacao_id=p_operacao;
 if found then
  if l.visitante_id<>p_paciente or l.registrado_por_id<>p_usuario or l.tipo<>'reembolso' or l.valor<>v or l.reembolso_de_id<>(p_dados->>'lancamento_id')::bigint or l.observacao<>btrim(p_dados->>'observacao') then raise exception 'Operação já utilizada com outros dados.'; end if;
  return to_jsonb(l);
 end if;
 if v is null or v<=0 or v>1000000 or v<>round(v,2) or coalesce(length(btrim(p_dados->>'observacao')),0) not between 1 and 2000 then raise exception 'Reembolso inválido.'; end if;
 select * into o from public.lancamentos_financeiros where id=(p_dados->>'lancamento_id')::bigint and visitante_id=p_paciente and tipo='atendimento' for update;
 if not found then raise exception 'Lançamento original não encontrado.'; end if;
 select coalesce(sum(valor),0) into total from public.lancamentos_financeiros where reembolso_de_id=o.id and tipo='reembolso';
 if total+v>o.valor then raise exception 'O reembolso ultrapassa o valor disponível deste lançamento.'; end if;
 insert into public.lancamentos_financeiros(visitante_id,tipo,descricao,valor,reembolso_de_id,observacao,registrado_por_id,registrado_por_email,registrado_por_nome,operacao_id)
 values(p_paciente,'reembolso',left('Reembolso: '||o.descricao,250),v,o.id,btrim(p_dados->>'observacao'),p_usuario,p_dados->>'registrado_por_email',p_dados->>'registrado_por_nome',p_operacao) returning * into l;
 return to_jsonb(l);
end; $$;
revoke all on function public.kahenna_registrar_financeiro(uuid,jsonb,uuid,uuid),public.kahenna_reembolsar_financeiro(uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_registrar_financeiro(uuid,jsonb,uuid,uuid),public.kahenna_reembolsar_financeiro(uuid,jsonb,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
