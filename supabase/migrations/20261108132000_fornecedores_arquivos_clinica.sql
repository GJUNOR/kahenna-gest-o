begin;
create table public.fornecedores_clinica(id uuid primary key,nome text not null check(length(nome) between 1 and 160),contato text not null default '',telefone text not null default '',email text not null default '',categoria text not null default '',observacao text not null default '',ativo boolean not null default true,revisao integer not null default 0,usuario_id uuid not null references auth.users(id),criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now());
create table public.arquivos_clinica(id uuid primary key,titulo text not null,categoria text not null,nome_original text not null,mime text not null,caminho text not null unique,sha256 text not null,tamanho integer not null check(tamanho>0 and tamanho<=15728640),usuario_id uuid not null references auth.users(id),criado_em timestamptz not null default now());
create table public.clinica_acessos(id bigint generated always as identity primary key,usuario_id uuid not null references auth.users(id),acao text not null,registro_id uuid,criado_em timestamptz not null default now());
alter table public.fornecedores_clinica enable row level security;
alter table public.arquivos_clinica enable row level security;
alter table public.clinica_acessos enable row level security;
revoke all on public.fornecedores_clinica,public.arquivos_clinica,public.clinica_acessos from public,anon,authenticated;
grant select,insert,update on public.fornecedores_clinica to service_role;
grant select,insert on public.arquivos_clinica,public.clinica_acessos to service_role;
grant usage,select on sequence public.clinica_acessos_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('kahenna-arquivos','kahenna-arquivos',false,15728640,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']) on conflict(id) do nothing;
create function public.kahenna_salvar_fornecedor(p_id uuid,p_dados jsonb,p_revisao integer,p_usuario uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.fornecedores_clinica;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,39));
 select * into f from public.fornecedores_clinica where id=p_id for update;
 if found then
  if (to_jsonb(f)-array['id','revisao','usuario_id','criado_em','atualizado_em'])=p_dados then return to_jsonb(f);end if;
  if f.revisao is distinct from p_revisao then raise exception 'Cadastro atualizado em outra janela. Reabra antes de editar.';end if;
  update public.fornecedores_clinica set nome=p_dados->>'nome',contato=p_dados->>'contato',telefone=p_dados->>'telefone',email=p_dados->>'email',categoria=p_dados->>'categoria',observacao=p_dados->>'observacao',ativo=(p_dados->>'ativo')::boolean,usuario_id=p_usuario,revisao=revisao+1,atualizado_em=now() where id=p_id returning * into f;
 else
  insert into public.fornecedores_clinica(id,nome,contato,telefone,email,categoria,observacao,ativo,usuario_id) values(p_id,p_dados->>'nome',p_dados->>'contato',p_dados->>'telefone',p_dados->>'email',p_dados->>'categoria',p_dados->>'observacao',(p_dados->>'ativo')::boolean,p_usuario) returning * into f;
 end if;
 insert into public.clinica_acessos(usuario_id,acao,registro_id) values(p_usuario,'salvar_fornecedor',p_id);return to_jsonb(f);
end;$$;
revoke all on function public.kahenna_salvar_fornecedor(uuid,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_salvar_fornecedor(uuid,jsonb,integer,uuid) to service_role;
notify pgrst,'reload schema';commit;
