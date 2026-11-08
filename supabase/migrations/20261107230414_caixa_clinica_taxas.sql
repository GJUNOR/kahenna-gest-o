begin;
create table public.caixa_despesas (
 id uuid primary key,
 tipo text not null check(tipo in ('compra','despesa')),
 descricao text not null check(length(btrim(descricao)) between 1 and 200),
 categoria text not null check(length(categoria) between 1 and 60),
 valor numeric(12,2) not null check(valor>0 and valor<=1000000),
 data_pagamento date not null,
 quantidade numeric(12,3) check(quantidade>0),
 unidade text check(length(unidade)<=30),
 fornecedor text check(length(fornecedor)<=120),
 lote text check(length(lote)<=120),
 validade date,
 observacao text check(length(observacao)<=1000),
 usuario_id uuid not null references auth.users(id),
 revisao integer not null default 0,
 excluido_em timestamptz,
 criado_em timestamptz not null default now(),
 alterado_em timestamptz not null default now()
);
create index caixa_despesas_periodo_idx on public.caixa_despesas(data_pagamento desc,criado_em desc) where excluido_em is null;
create table public.caixa_config (
 id boolean primary key default true check(id),
 taxas jsonb not null default '{}'::jsonb,
 revisao integer not null default 0,
 usuario_id uuid references auth.users(id),
 alterado_em timestamptz not null default now()
);
insert into public.caixa_config(id) values(true);
alter table public.caixa_despesas enable row level security;
alter table public.caixa_config enable row level security;
revoke all on public.caixa_despesas,public.caixa_config from public,anon,authenticated;
grant select,insert,update on public.caixa_despesas,public.caixa_config to service_role;
alter table public.estoque_movimentos add column if not exists caixa_excluido_em timestamptz;
grant update(caixa_excluido_em) on public.estoque_movimentos to service_role;
alter table public.lancamentos_financeiros add column if not exists canal_pagamento text check(canal_pagamento in ('maquininha','link'));
alter table public.lancamentos_financeiros add column if not exists bandeira text check(bandeira in ('visa','mastercard','elo','amex','outras'));
alter table public.lancamentos_financeiros add column if not exists taxa_percentual numeric(7,4);
alter table public.lancamentos_financeiros add column if not exists taxa_valor numeric(12,2) not null default 0 check(taxa_valor>=0 and taxa_valor<=valor);

create function public.kahenna_aplicar_taxa_cartao()
returns trigger language plpgsql security invoker set search_path='' as $$
declare config jsonb; grupo text;
begin
 new.taxa_valor:=0;
 new.taxa_percentual:=0;
 if new.tipo='atendimento' and new.forma_pagamento in ('debito','credito') then
  select taxas into config from public.caixa_config where id=true;
    grupo:=case when new.bandeira='outras' then 'outras' when new.canal_pagamento='link' then 'todas' when new.bandeira in ('visa','mastercard') then 'visa_mastercard' when new.bandeira in ('elo','amex') then 'elo_amex' end;
  new.taxa_percentual:=(config->>(new.canal_pagamento||':'||grupo||':'||new.forma_pagamento||':'||new.parcelas::text))::numeric;
  if new.taxa_percentual is null then raise exception 'Cadastre a taxa desta bandeira e forma de pagamento antes de registrar.'; end if;
  new.taxa_valor:=coalesce(round(new.valor*new.taxa_percentual/100,2),0);
 end if;
 return new;
end; $$;
revoke all on function public.kahenna_aplicar_taxa_cartao() from public,anon,authenticated;
create trigger lancamento_taxa_cartao before insert on public.lancamentos_financeiros for each row execute function public.kahenna_aplicar_taxa_cartao();

create function public.kahenna_caixa_taxas(p_taxas jsonb,p_revisao integer,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.caixa_config; par record;
begin
 if p_taxas is null or jsonb_typeof(p_taxas)<>'object' or p_usuario is null then raise exception 'Configuração inválida.'; end if;
 for par in select key,value from jsonb_each(p_taxas) loop
  if par.key !~ '^(maquininha:(visa_mastercard|elo_amex|outras):(debito:1|credito:[1-6])|link:(todas|outras):credito:[1-6])$' or jsonb_typeof(par.value)<>'number' or par.value::text::numeric<0 or par.value::text::numeric>100 or par.value::text::numeric<>round(par.value::text::numeric,4) then raise exception 'Confira as porcentagens informadas.'; end if;
 end loop;
 select * into c from public.caixa_config where id=true for update;
 if c.taxas=p_taxas then return to_jsonb(c); end if;
 if p_revisao is distinct from c.revisao then raise exception 'As taxas foram alteradas. Atualize a página.'; end if;
 update public.caixa_config set taxas=p_taxas,revisao=revisao+1,usuario_id=p_usuario,alterado_em=now() where id=true returning * into c;
 return to_jsonb(c);
end; $$;

create function public.kahenna_caixa_salvar(p_id uuid,p_dados jsonb,p_revisao integer,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.caixa_despesas; v public.caixa_despesas;
begin
 if p_id is null or p_usuario is null then raise exception 'Operação inválida.'; end if;
 v:=jsonb_populate_record(null::public.caixa_despesas,p_dados);
 if v.tipo is null or v.descricao is null or v.valor is null or v.categoria is null or v.data_pagamento is null or v.data_pagamento>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Confira os campos e a data do pagamento.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,12));
 select * into d from public.caixa_despesas where id=p_id for update;
 if found then
  if d.excluido_em is not null then raise exception 'Este lançamento foi excluído.'; end if;
  if (to_jsonb(d)-array['id','usuario_id','revisao','excluido_em','criado_em','alterado_em'])=(to_jsonb(v)-array['id','usuario_id','revisao','excluido_em','criado_em','alterado_em']) then return to_jsonb(d); end if;
  if p_revisao is distinct from d.revisao then raise exception 'Este lançamento mudou. Atualize a página antes de editar.'; end if;
  update public.caixa_despesas set tipo=v.tipo,descricao=v.descricao,categoria=v.categoria,valor=v.valor,data_pagamento=v.data_pagamento,quantidade=v.quantidade,unidade=v.unidade,fornecedor=v.fornecedor,lote=v.lote,validade=v.validade,observacao=v.observacao,revisao=revisao+1,usuario_id=p_usuario,alterado_em=now() where id=p_id returning * into d;
 else
  insert into public.caixa_despesas(id,tipo,descricao,categoria,valor,data_pagamento,quantidade,unidade,fornecedor,lote,validade,observacao,usuario_id)
  values(p_id,v.tipo,v.descricao,v.categoria,v.valor,v.data_pagamento,v.quantidade,v.unidade,v.fornecedor,v.lote,v.validade,v.observacao,p_usuario) returning * into d;
 end if;
 return to_jsonb(d);
end; $$;

create function public.kahenna_caixa_excluir(p_id uuid,p_origem text,p_revisao integer,p_usuario uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.caixa_despesas;
begin
 if p_usuario is null then raise exception 'Usuário inválido.'; end if;
 if p_origem='compra_anterior' then
  update public.estoque_movimentos set caixa_excluido_em=coalesce(caixa_excluido_em,now()) where id=p_id and tipo='entrada';
  if not found then raise exception 'Compra não encontrada.'; end if;
 elsif p_origem='despesa' then
  select * into d from public.caixa_despesas where id=p_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if d.excluido_em is not null then return; end if;
  if p_revisao is distinct from d.revisao then raise exception 'Este lançamento mudou. Atualize antes de excluir.'; end if;
  update public.caixa_despesas set excluido_em=now(),usuario_id=p_usuario,revisao=revisao+1,alterado_em=now() where id=p_id;
 else raise exception 'Tipo de lançamento inválido.';
 end if;
end; $$;

create function public.kahenna_caixa_painel(p_inicio date,p_fim date,p_pagina integer default 0,p_busca text default '',p_tipo text default 'gastos')
returns jsonb language sql stable security invoker set search_path='' as $$
with despesas as (
 select d.id::text as id,'despesa'::text as origem,d.tipo,d.descricao,d.categoria,d.valor,d.data_pagamento as dia,d.criado_em,jsonb_build_object('revisao',d.revisao,'quantidade',d.quantidade,'unidade',d.unidade,'fornecedor',d.fornecedor,'lote',d.lote,'validade',d.validade,'observacao',d.observacao) as detalhes
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
update public.caixa_config set taxas='{"link:todas:credito:4":7.91,"maquininha:elo_amex:credito:1":4.91,"maquininha:elo_amex:credito:2":6.47,"maquininha:visa_mastercard:credito:3":6.12,"maquininha:visa_mastercard:credito:5":7.57,"link:todas:credito:5":8.8,"maquininha:visa_mastercard:credito:6":8.28,"maquininha:elo_amex:credito:4":7.92,"maquininha:elo_amex:credito:5":8.63,"maquininha:visa_mastercard:credito:4":6.85,"maquininha:visa_mastercard:credito:1":3.15,"maquininha:elo_amex:credito:3":7.2,"maquininha:elo_amex:debito:1":2.58,"maquininha:visa_mastercard:credito:2":5.39,"link:todas:credito:1":4.2,"maquininha:elo_amex:credito:6":9.33,"link:todas:credito:6":9.67,"link:todas:credito:3":7.01,"link:todas:credito:2":6.09,"maquininha:visa_mastercard:debito:1":1.37}'::jsonb where id=true;
create or replace function public.kahenna_registrar_financeiro(p_paciente uuid,p_dados jsonb,p_usuario uuid,p_operacao uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v numeric; n integer; l public.lancamentos_financeiros; existente public.lancamentos_financeiros;
begin
 -- Authenticated active staff are checked by Express; browser roles cannot execute this RPC.
 if p_operacao is null then raise exception 'Operação inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operacao::text,1));
 select * into existente from public.lancamentos_financeiros where operacao_id=p_operacao;
 if found then
  if existente.visitante_id<>p_paciente or existente.registrado_por_id<>p_usuario or existente.tipo<>'atendimento' or existente.valor<>(p_dados->>'valor')::numeric or existente.descricao<>btrim(p_dados->>'descricao') or existente.forma_pagamento<>p_dados->>'forma_pagamento' or existente.parcelas<>coalesce((p_dados->>'parcelas')::integer,1) or coalesce(existente.observacao,'')<>coalesce(p_dados->>'observacao','') or coalesce(existente.canal_pagamento,'')<>coalesce(p_dados->>'canal_pagamento','') or coalesce(existente.bandeira,'')<>coalesce(p_dados->>'bandeira','') then raise exception 'Operação já utilizada com outros dados.'; end if;
  return jsonb_build_object('lancamento',to_jsonb(existente),'paciente',jsonb_build_object('visitante_id',p_paciente,'status','convertido'));
 end if;
 v:=(p_dados->>'valor')::numeric; n:=coalesce((p_dados->>'parcelas')::integer,1);
 if coalesce(p_dados->>'tipo','')<>'atendimento' or v is null or v<=0 or v>1000000 or v<>round(v,2) or coalesce(length(btrim(p_dados->>'descricao')),0) not between 1 and 200 or coalesce(p_dados->>'forma_pagamento','') not in ('pix','dinheiro','debito','credito') or n not between 1 and 6 then raise exception 'Dados financeiros inválidos.'; end if;
 if p_dados->>'forma_pagamento'<>'credito' and n<>1 then raise exception 'Parcelas disponíveis somente para crédito.'; end if;
 if p_dados->>'forma_pagamento' in ('debito','credito') and (coalesce(p_dados->>'canal_pagamento','') not in ('maquininha','link') or coalesce(p_dados->>'bandeira','') not in ('visa','mastercard','elo','amex','outras') or (p_dados->>'forma_pagamento'='debito' and p_dados->>'canal_pagamento'='link')) then raise exception 'Confira o canal e a bandeira do cartão.'; end if;
 perform 1 from public.visitantes where visitante_id=p_paciente for update;
 if not found then raise exception 'Paciente não encontrado.'; end if;
 insert into public.lancamentos_financeiros(visitante_id,tipo,descricao,valor,forma_pagamento,parcelas,observacao,registrado_por_id,registrado_por_email,registrado_por_nome,operacao_id,canal_pagamento,bandeira)
 values(p_paciente,'atendimento',btrim(p_dados->>'descricao'),v,p_dados->>'forma_pagamento',n,p_dados->>'observacao',p_usuario,p_dados->>'registrado_por_email',p_dados->>'registrado_por_nome',p_operacao,p_dados->>'canal_pagamento',p_dados->>'bandeira') returning * into l;
 update public.visitantes set status='convertido' where visitante_id=p_paciente;
 return jsonb_build_object('lancamento',to_jsonb(l),'paciente',jsonb_build_object('visitante_id',p_paciente,'status','convertido'));
end; $$;

revoke all on function public.kahenna_caixa_taxas(jsonb,integer,uuid),public.kahenna_caixa_salvar(uuid,jsonb,integer,uuid),public.kahenna_caixa_excluir(uuid,text,integer,uuid),public.kahenna_caixa_painel(date,date,integer,text,text) from public,anon,authenticated;
grant execute on function public.kahenna_caixa_taxas(jsonb,integer,uuid),public.kahenna_caixa_salvar(uuid,jsonb,integer,uuid),public.kahenna_caixa_excluir(uuid,text,integer,uuid),public.kahenna_caixa_painel(date,date,integer,text,text) to service_role;
notify pgrst,'reload schema';
commit;
