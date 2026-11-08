begin;
create table public.procedimentos_precos(id uuid primary key,nome text not null check(length(nome) between 1 and 160),unidade text not null check(unidade in ('procedimento','ml')),valor numeric(12,2) not null check(valor>0 and valor<=1000000),ativo boolean not null default true,revisao integer not null default 0,usuario_id uuid references auth.users(id),atualizado_em timestamptz not null default now());
create unique index procedimentos_nome_idx on public.procedimentos_precos(lower(nome));
insert into public.procedimentos_precos(id,nome,unidade,valor) values
 ('a1111111-1111-4111-8111-111111111111','Toxina botulínica','procedimento',750),
 ('a2222222-2222-4222-8222-222222222222','Preenchimento labial','ml',550),
 ('a3333333-3333-4333-8333-333333333333','Preenchimento de nariz','ml',750);
create table public.orcamentos_pacientes(id uuid primary key,paciente_id uuid not null references public.visitantes(visitante_id),titulo text not null check(length(titulo) between 1 and 160),itens jsonb not null check(jsonb_typeof(itens)='array' and jsonb_array_length(itens) between 1 and 50),total numeric(12,2) not null check(total>0 and total<=1000000),pagamento jsonb not null check(jsonb_typeof(pagamento)='array' and jsonb_array_length(pagamento) between 1 and 5),observacao text not null default '',revisao integer not null default 0,lancamento_id bigint unique references public.lancamentos_financeiros(id),recebido_em timestamptz,usuario_id uuid not null references auth.users(id),criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now());
create index orcamentos_paciente_idx on public.orcamentos_pacientes(paciente_id,criado_em desc);
alter table public.orcamentos_pacientes add column taxa_valor numeric(12,2) not null default 0;
alter table public.orcamentos_pacientes add column taxa_percentual numeric(7,4);
create table public.orcamento_recebimentos(orcamento_id uuid not null references public.orcamentos_pacientes(id),ordem integer not null,lancamento_id bigint not null unique references public.lancamentos_financeiros(id),primary key(orcamento_id,ordem));
alter table public.orcamento_recebimentos enable row level security;
revoke all on public.orcamento_recebimentos from public,anon,authenticated;
grant select,insert on public.orcamento_recebimentos to service_role;
alter table public.procedimentos_precos enable row level security;
alter table public.orcamentos_pacientes enable row level security;
revoke all on public.procedimentos_precos,public.orcamentos_pacientes from public,anon,authenticated;
grant select,insert,update on public.procedimentos_precos,public.orcamentos_pacientes to service_role;
create function public.kahenna_salvar_orcamento(p_id uuid,p_paciente uuid,p_dados jsonb,p_revisao integer,p_usuario uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orcamentos_pacientes; soma numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,40));
 select coalesce(sum(round((i->>'quantidade')::numeric*(i->>'valor_unitario')::numeric,2)),0) into soma from jsonb_array_elements(p_dados->'itens') i;
 if (select coalesce(sum((p->>'valor')::numeric),0) from jsonb_array_elements(p_dados->'pagamento') p)<>soma then raise exception 'A soma dos pagamentos deve ser igual ao total do orçamento.';end if;
 select * into o from public.orcamentos_pacientes where id=p_id for update;
 if found then
  if o.paciente_id<>p_paciente then raise exception 'Orçamento de outro paciente.';end if;
  if o.lancamento_id is not null then raise exception 'Este orçamento já foi recebido. Consulte o Financeiro do paciente.';end if;
  if o.itens=p_dados->'itens' and o.titulo=p_dados->>'titulo' and o.pagamento=p_dados->'pagamento' and o.observacao=p_dados->>'observacao' then return to_jsonb(o);end if;
  if o.revisao is distinct from p_revisao then raise exception 'O orçamento foi atualizado em outra janela. Reabra antes de editar.';end if;
  update public.orcamentos_pacientes set titulo=p_dados->>'titulo',itens=p_dados->'itens',total=soma,pagamento=p_dados->'pagamento',observacao=p_dados->>'observacao',usuario_id=p_usuario,revisao=revisao+1,atualizado_em=now() where id=p_id returning * into o;
 else
  insert into public.orcamentos_pacientes(id,paciente_id,titulo,itens,total,pagamento,observacao,usuario_id) values(p_id,p_paciente,p_dados->>'titulo',p_dados->'itens',soma,p_dados->'pagamento',p_dados->>'observacao',p_usuario) returning * into o;
 end if;
 insert into public.clinica_acessos(usuario_id,acao,registro_id) values(p_usuario,'salvar_orcamento',p_id);return to_jsonb(o);
end;$$;
create function public.kahenna_receber_orcamento(p_id uuid,p_revisao integer,p_usuario uuid,p_email text,p_nome text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orcamentos_pacientes;r jsonb;p record;primeira bigint;taxas numeric:=0;agenda_ids bigint[];
begin
 select * into o from public.orcamentos_pacientes where id=p_id for update;
 if not found then raise exception 'Orçamento não encontrado.';end if;
 if o.lancamento_id is not null then return to_jsonb(o);end if;
 if o.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Confira os valores novamente.';end if;
 for p in select value as dados,ordinality as ordem from jsonb_array_elements(o.pagamento) with ordinality loop
  r:=public.kahenna_registrar_financeiro(o.paciente_id,p.dados||jsonb_build_object('tipo','atendimento','descricao','Orçamento · '||o.titulo||case when jsonb_array_length(o.pagamento)>1 then ' ('||p.ordem||'/'||jsonb_array_length(o.pagamento)||')' else '' end,'valor',(p.dados->>'valor')::numeric,'observacao',left(concat_ws(E'\n',(select string_agg((i->>'nome')||' · '||(i->>'quantidade')||' '||(i->>'unidade'),'; ') from jsonb_array_elements(o.itens) i),nullif(o.observacao,'')),1000),'registrado_por_email',p_email,'registrado_por_nome',p_nome),p_usuario,md5(o.id::text||':'||p.ordem::text)::uuid);
  if primeira is null then primeira:=(r->'lancamento'->>'id')::bigint;end if;
  taxas:=taxas+(r->'lancamento'->>'taxa_valor')::numeric;
  insert into public.orcamento_recebimentos(orcamento_id,ordem,lancamento_id) values(o.id,p.ordem,(r->'lancamento'->>'id')::bigint);
 end loop;
 update public.orcamentos_pacientes set lancamento_id=primeira,taxa_valor=taxas,taxa_percentual=case when jsonb_array_length(o.pagamento)=1 then (r->'lancamento'->>'taxa_percentual')::numeric else null end,recebido_em=now(),usuario_id=p_usuario,revisao=revisao+1,atualizado_em=now() where id=p_id returning * into o;
 -- Only the current one-hour visit, never another date, a cancellation or an ambiguous match.
 select array_agg(a.id) into agenda_ids from (select id from public.agendamentos where visitante_id=o.paciente_id and status='agendado' and atendido_em is null and (data_avaliacao at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date and data_avaliacao<=now() and data_avaliacao+interval '1 hour'>now() order by id for update) a;
 if cardinality(agenda_ids)=1 then
  update public.agendamentos set atendido_em=now() where id=agenda_ids[1] and atendido_em is null;
 end if;
 insert into public.clinica_acessos(usuario_id,acao,registro_id) values(p_usuario,'receber_orcamento',p_id);return to_jsonb(o);
end;$$;
revoke all on function public.kahenna_salvar_orcamento(uuid,uuid,jsonb,integer,uuid),public.kahenna_receber_orcamento(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.kahenna_salvar_orcamento(uuid,uuid,jsonb,integer,uuid),public.kahenna_receber_orcamento(uuid,integer,uuid,text,text) to service_role;
notify pgrst,'reload schema';commit;
