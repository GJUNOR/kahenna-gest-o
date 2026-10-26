-- Apply only to the exclusive Kahenna project, never to Atlas.
begin;
create table public.documentos_pacientes (
 id uuid primary key,
 paciente_id uuid not null references public.visitantes(visitante_id) on delete restrict,
 nome_original text not null check(length(nome_original) between 5 and 180),
 bucket text not null default 'kahenna-prontuarios' check(bucket='kahenna-prontuarios'),
 caminho text not null unique,
 tamanho_bytes integer not null check(tamanho_bytes between 1 and 15728640),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 enviado_por uuid references auth.users(id) on delete set null,
 criado_em timestamptz not null default now(),
 check(caminho=paciente_id::text || '/' || id::text || '.pdf')
);
create index documentos_paciente_data_idx on public.documentos_pacientes(paciente_id,criado_em desc);
create index documentos_autor_idx on public.documentos_pacientes(enviado_por);
create table public.documentos_auditoria (
 id bigint generated always as identity primary key,
 documento_id uuid references public.documentos_pacientes(id) on delete restrict,
 paciente_id uuid not null references public.visitantes(visitante_id) on delete restrict,
 usuario_id uuid references auth.users(id) on delete set null,
 acao text not null check(acao in ('enviar','listar','baixar')),
 criado_em timestamptz not null default now()
);
create index documentos_auditoria_documento_idx on public.documentos_auditoria(documento_id,criado_em desc);
create index documentos_auditoria_paciente_idx on public.documentos_auditoria(paciente_id,criado_em desc);
create index documentos_auditoria_usuario_idx on public.documentos_auditoria(usuario_id);
alter table public.documentos_pacientes enable row level security;
alter table public.documentos_auditoria enable row level security;
revoke all on public.documentos_pacientes,public.documentos_auditoria from public,anon,authenticated;
grant select,insert on public.documentos_pacientes,public.documentos_auditoria to service_role;
revoke all on sequence public.documentos_auditoria_id_seq from public,anon,authenticated;
grant usage,select on sequence public.documentos_auditoria_id_seq to service_role;
-- The trusted server authorizes active administrators before calling this invoker function.
create function public.kahenna_registrar_documento(p_id uuid,p_paciente uuid,p_nome text,p_caminho text,p_tamanho integer,p_hash text,p_usuario uuid)
returns setof public.documentos_pacientes language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.documentos_pacientes(id,paciente_id,nome_original,caminho,tamanho_bytes,sha256,enviado_por)
 values(p_id,p_paciente,p_nome,p_caminho,p_tamanho,p_hash,p_usuario);
 insert into public.documentos_auditoria(documento_id,paciente_id,usuario_id,acao) values(p_id,p_paciente,p_usuario,'enviar');
 return query select * from public.documentos_pacientes where id=p_id;
end; $$;
revoke all on function public.kahenna_registrar_documento(uuid,uuid,text,text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_registrar_documento(uuid,uuid,text,text,integer,text,uuid) to service_role;
-- No client policies: all PDF operations go through the authorized server.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kahenna-prontuarios','kahenna-prontuarios',false,15728640,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=array['application/pdf'];
notify pgrst,'reload schema';
commit;
