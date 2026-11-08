begin;
create table public.clinica_turnos (
 dia date primary key,
 periodo text not null check(periodo in ('Matutino','Vespertino','Noturno','Sem atendimento')),
 revisao integer not null default 0,
 usuario_id uuid not null references auth.users(id),
 atualizado_em timestamptz not null default now()
);
alter table public.clinica_turnos enable row level security;
revoke all on public.clinica_turnos from public,anon,authenticated;
grant select,insert,update on public.clinica_turnos to service_role;
create function public.kahenna_salvar_turno(p_dia date,p_periodo text,p_revisao integer,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare anterior public.clinica_turnos;salvo public.clinica_turnos;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_dia::text,44));
 select * into anterior from public.clinica_turnos where dia=p_dia for update;
 if found then
  if anterior.periodo=p_periodo then return to_jsonb(anterior);end if;
  if anterior.revisao is distinct from p_revisao then raise exception 'O horário foi alterado em outra tela. Reabra a data antes de salvar.';end if;
  update public.clinica_turnos set periodo=p_periodo,revisao=revisao+1,usuario_id=p_usuario,atualizado_em=now() where dia=p_dia returning * into salvo;
 else
  if p_revisao is not null then raise exception 'Reabra a data antes de salvar.';end if;
  insert into public.clinica_turnos(dia,periodo,usuario_id) values(p_dia,p_periodo,p_usuario) returning * into salvo;
 end if;
 insert into public.clinica_acessos(usuario_id,acao) values(p_usuario,'alterar_turno:'||p_dia::text||':'||p_periodo);
 return to_jsonb(salvo);
end;$$;
revoke all on function public.kahenna_salvar_turno(date,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_salvar_turno(date,text,integer,uuid) to service_role;
notify pgrst,'reload schema';
commit;
