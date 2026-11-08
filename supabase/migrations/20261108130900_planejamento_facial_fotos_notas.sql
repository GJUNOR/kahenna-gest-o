begin;
create table public.planos_faciais (
 id uuid primary key, paciente_id uuid not null references public.visitantes(visitante_id),
 titulo text not null check(length(titulo) between 1 and 120), data_atendimento date not null,
 estado text not null check(estado in ('planejado','realizado')), pontos jsonb not null check(jsonb_typeof(pontos)='array' and jsonb_array_length(pontos)<=200),
 observacao text not null default '' check(length(observacao)<=2000), revisao integer not null default 0,
 usuario_id uuid not null references auth.users(id), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index planos_paciente_data_idx on public.planos_faciais(paciente_id,data_atendimento desc);
create table public.estetica_auditoria(id bigint generated always as identity primary key,paciente_id uuid not null references public.visitantes(visitante_id),usuario_id uuid not null references auth.users(id),acao text not null,registro_id uuid,anterior jsonb,criado_em timestamptz not null default now());
create index estetica_auditoria_paciente_idx on public.estetica_auditoria(paciente_id,criado_em desc);
create table public.fotos_evolucao(id uuid primary key,paciente_id uuid not null references public.visitantes(visitante_id),titulo text not null check(length(titulo) between 1 and 120),data_foto date not null,vista text not null check(vista in ('frente','perfil_esquerdo','perfil_direito')),caminho text not null unique,sha256 text not null,tamanho integer not null check(tamanho>0 and tamanho<=8388608),usuario_id uuid not null references auth.users(id),criado_em timestamptz not null default now());
create index fotos_paciente_data_idx on public.fotos_evolucao(paciente_id,data_foto desc);
alter table public.planos_faciais enable row level security;
alter table public.fotos_evolucao enable row level security;
alter table public.estetica_auditoria enable row level security;
revoke all on public.planos_faciais,public.fotos_evolucao,public.estetica_auditoria from public,anon,authenticated;
grant select,insert,update on public.planos_faciais to service_role;
grant select,insert on public.fotos_evolucao,public.estetica_auditoria to service_role;
grant usage,select on sequence public.estetica_auditoria_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('kahenna-evolucao','kahenna-evolucao',false,8388608,array['image/jpeg']) on conflict(id) do nothing;
create function public.kahenna_salvar_plano(p_id uuid,p_paciente uuid,p_dados jsonb,p_revisao integer,p_usuario uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare anterior public.planos_faciais; atual public.planos_faciais;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,37));
 select * into anterior from public.planos_faciais where id=p_id for update;
 if found then
  if anterior.paciente_id<>p_paciente then raise exception 'Plano de outro paciente.';end if;
  if anterior.titulo=p_dados->>'titulo' and anterior.estado=p_dados->>'estado' and anterior.data_atendimento=(p_dados->>'data_atendimento')::date and anterior.pontos=p_dados->'pontos' and anterior.observacao=p_dados->>'observacao' then return to_jsonb(anterior);end if;
  if anterior.revisao is distinct from p_revisao then raise exception 'O plano foi atualizado em outra janela. Reabra antes de editar.';end if;
  update public.planos_faciais set titulo=p_dados->>'titulo',estado=p_dados->>'estado',data_atendimento=(p_dados->>'data_atendimento')::date,pontos=p_dados->'pontos',observacao=p_dados->>'observacao',revisao=revisao+1,usuario_id=p_usuario,atualizado_em=now() where id=p_id returning * into atual;
 else
  insert into public.planos_faciais(id,paciente_id,titulo,estado,data_atendimento,pontos,observacao,usuario_id) values(p_id,p_paciente,p_dados->>'titulo',p_dados->>'estado',(p_dados->>'data_atendimento')::date,p_dados->'pontos',p_dados->>'observacao',p_usuario) returning * into atual;
 end if;
 insert into public.estetica_auditoria(paciente_id,usuario_id,acao,registro_id,anterior) values(p_paciente,p_usuario,'salvar_plano',p_id,case when anterior.id is null then null else to_jsonb(anterior) end);
 return to_jsonb(atual);
end;$$;
revoke all on function public.kahenna_salvar_plano(uuid,uuid,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_salvar_plano(uuid,uuid,jsonb,integer,uuid) to service_role;
alter table public.caixa_despesas add column nota_chave text;
alter table public.caixa_despesas add column nota_itens jsonb;
create unique index caixa_nota_chave_idx on public.caixa_despesas(nota_chave) where nota_chave is not null;
-- Nota confirmada gera um único gasto; seus itens ficam na observação, sem baixa de estoque.
create function public.kahenna_importar_nota(p_id uuid,p_dados jsonb,p_chave text,p_usuario uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.caixa_despesas;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_chave,38));
 select * into d from public.caixa_despesas where nota_chave=p_chave;
 if found then
  if d.excluido_em is null then raise exception 'Esta nota já foi importada. Confira os lançamentos do Caixa.';end if;
  update public.caixa_despesas set excluido_em=null,descricao=p_dados->>'descricao',categoria=p_dados->>'categoria',valor=(p_dados->>'valor')::numeric,data_pagamento=(p_dados->>'data_pagamento')::date,fornecedor=p_dados->>'fornecedor',observacao=p_dados->>'observacao',nota_itens=p_dados->'nota_itens',revisao=revisao+1,usuario_id=p_usuario,alterado_em=now() where id=d.id returning * into d;
  return to_jsonb(d);
 end if;
 perform public.kahenna_caixa_salvar(p_id,p_dados,null,p_usuario);
 update public.caixa_despesas set nota_chave=p_chave,nota_itens=p_dados->'nota_itens' where id=p_id returning * into d;
 return to_jsonb(d);
end;$$;
revoke all on function public.kahenna_importar_nota(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_importar_nota(uuid,jsonb,text,uuid) to service_role;
create or replace function public.kahenna_caixa_painel(p_inicio date,p_fim date,p_pagina integer default 0,p_busca text default '',p_tipo text default 'gastos')
returns jsonb language sql stable security invoker set search_path='' as $$
with despesas as (
 select d.id::text as id,'despesa'::text as origem,d.tipo,d.descricao,d.categoria,d.valor,d.data_pagamento as dia,d.criado_em,jsonb_build_object('revisao',d.revisao,'quantidade',d.quantidade,'unidade',d.unidade,'fornecedor',d.fornecedor,'lote',d.lote,'validade',d.validade,'observacao',d.observacao,'nota_itens',d.nota_itens) as detalhes
 from public.caixa_despesas d where excluido_em is null and data_pagamento>=p_inicio and data_pagamento<p_fim
 union all
 select m.id::text,'compra_anterior','compra',p.nome,'Produtos',round(m.valor_total,2),m.ocorrido_em,m.criado_em,jsonb_build_object('quantidade',m.quantidade,'unidade',m.unidade_registro,'fornecedor',m.fornecedor,'observacao',m.motivo)
 from public.estoque_movimentos m join public.estoque_produtos p on p.id=m.produto_id
 where m.tipo='entrada' and p.ativo and m.caixa_excluido_em is null and m.ocorrido_em>=p_inicio and m.ocorrido_em<p_fim
), entradas as (
 select l.id::text as id,'recebimento'::text as origem,l.tipo,l.descricao||' · '||coalesce(v.nome,'Paciente') as descricao,'Pacientes'::text as categoria,case when l.tipo='reembolso' then -l.valor else l.valor end as valor,(l.criado_em at time zone 'America/Sao_Paulo')::date as dia,l.criado_em,jsonb_build_object('forma_pagamento',l.forma_pagamento,'parcelas',l.parcelas,'taxa_valor',l.taxa_valor,'taxa_percentual',l.taxa_percentual,'canal_pagamento',l.canal_pagamento,'bandeira',l.bandeira) as detalhes,l.taxa_valor as taxa,case when l.tipo='atendimento' and l.forma_pagamento in ('debito','credito') and l.taxa_percentual is null then 1 else 0 end as taxa_pendente
 from public.lancamentos_financeiros l left join public.visitantes v on v.visitante_id=l.visitante_id
 where l.criado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo' and l.criado_em<p_fim::timestamp at time zone 'America/Sao_Paulo'
 union all
 select c.id::text,'recebimento_anterior','atendimento',coalesce(v.nome,'Recebimento anterior'),'Pacientes',c.valor,(c.valor_atualizado_em at time zone 'America/Sao_Paulo')::date,c.valor_atualizado_em,'{}'::jsonb,0,0
 from public.conversoes c left join public.visitantes v on v.visitante_id=c.visitante_id
 where c.valor>0 and c.valor_atualizado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo' and c.valor_atualizado_em<p_fim::timestamp at time zone 'America/Sao_Paulo'
), lista as (
 select id,origem,tipo,descricao,categoria,valor,dia,criado_em,detalhes from despesas where p_tipo='gastos'
 union all
 select id,origem,tipo,descricao,categoria,valor-taxa,dia,criado_em,detalhes from entradas where p_tipo='entradas'
), filtrados as (
 select * from lista where lower(regexp_replace(normalize(descricao,NFD),U&'[\0300-\036F]','','g')) like '%'||lower(p_busca)||'%'
), pagina as (
 select * from filtrados order by dia desc,criado_em desc,origem,id limit 10 offset greatest(p_pagina,0)*10
), totais as (
 select coalesce((select sum(valor) from entradas),0) as bruto,coalesce((select sum(taxa) from entradas),0) as taxas,coalesce((select sum(valor) from despesas),0) as gastos,coalesce((select sum(taxa_pendente) from entradas),0) as taxas_pendentes
)
select jsonb_build_object('entradas_brutas',bruto,'taxas_cartao',taxas,'entradas_liquidas',bruto-taxas,'gastos',gastos,'resultado',bruto-taxas-gastos,'taxas_pendentes',taxas_pendentes,'lancamentos',(select coalesce(jsonb_agg(to_jsonb(p) order by dia desc,criado_em desc,origem,id),'[]'::jsonb) from pagina p),'total',(select count(*) from filtrados)) from totais;
$$;
notify pgrst,'reload schema';
commit;
