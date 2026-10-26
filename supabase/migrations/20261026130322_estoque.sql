begin;
create table public.estoque_produtos (
 id uuid primary key default gen_random_uuid(),
 nome text not null check(length(btrim(nome)) between 1 and 120),
 categoria text not null default 'Outros' check(length(categoria) between 1 and 60),
 unidade text not null check(unidade in ('un','caixa','frasco','pacote','ml','g')),
 estoque_minimo numeric(12,3) not null default 0 check(estoque_minimo>=0),
 quantidade numeric(12,3) not null default 0 check(quantidade>=0),
 valor_estoque numeric(18,4) not null default 0 check(valor_estoque>=0),
 custo_medio numeric generated always as (case when quantidade>0 then valor_estoque/quantidade else 0 end) stored,
 precisa_repor boolean generated always as (quantidade<=estoque_minimo) stored,
 ativo boolean not null default true,
 criado_em timestamptz not null default now(),
 check(ativo or quantidade=0), check(quantidade<>0 or valor_estoque=0)
);
create unique index estoque_produtos_nome_idx on public.estoque_produtos(lower(btrim(nome)));
create index estoque_produtos_filtro_idx on public.estoque_produtos(ativo,precisa_repor,nome);
create table public.estoque_movimentos (
 id uuid primary key,
 produto_id uuid not null references public.estoque_produtos(id) on delete restrict,
 tipo text not null check(tipo in ('entrada','saida')),
 quantidade numeric(12,3) not null check(quantidade>0),
 custo_unitario numeric not null check(custo_unitario>=0),
 valor_total numeric(18,4) not null check(valor_total>=0),
 saldo_apos numeric(12,3) not null check(saldo_apos>=0),
 ocorrido_em date not null check(ocorrido_em>=date '1900-01-01' and ocorrido_em<=(now() at time zone 'America/Sao_Paulo')::date),
 motivo text not null check(length(motivo) between 1 and 300),
 fornecedor text not null default '' check(length(fornecedor)<=120),
 usuario_id uuid references auth.users(id) on delete set null,
 criado_em timestamptz not null default now()
);
create index estoque_movimentos_produto_idx on public.estoque_movimentos(produto_id,criado_em desc);
create index estoque_movimentos_data_idx on public.estoque_movimentos(ocorrido_em desc,criado_em desc);
create index estoque_movimentos_usuario_idx on public.estoque_movimentos(usuario_id);
alter table public.estoque_produtos enable row level security;
alter table public.estoque_movimentos enable row level security;
revoke all on public.estoque_produtos,public.estoque_movimentos from public,anon,authenticated;
grant select,insert,update on public.estoque_produtos to service_role;
grant select,insert on public.estoque_movimentos to service_role;
create function public.kahenna_movimentar_estoque(p_id uuid,p_produto uuid,p_tipo text,p_quantidade numeric,p_custo numeric,p_data date,p_motivo text,p_fornecedor text,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.estoque_produtos; anterior public.estoque_movimentos; valor numeric; nova_q numeric; novo_valor numeric; custo numeric;
begin
 if p_usuario is null then raise exception 'Responsável não identificado.'; end if;
 if p_id is null or p_quantidade is null or p_quantidade<=0 or p_quantidade<>round(p_quantidade,3) or p_quantidade>999999.999 or p_tipo is null or p_tipo not in ('entrada','saida') then raise exception 'Movimentação inválida.'; end if;
 if p_data is null or p_data<date '1900-01-01' or p_data>(now() at time zone 'America/Sao_Paulo')::date or p_motivo is null or length(btrim(p_motivo)) not between 1 and 300 or length(coalesce(p_fornecedor,''))>120 then raise exception 'Confira a data e os detalhes da movimentação.'; end if;
 select * into p from public.estoque_produtos where id=p_produto for update;
 if not found then raise exception 'Produto não encontrado.'; end if;
 -- Same request id returns its original result, including after an archive or stock change.
 select * into anterior from public.estoque_movimentos where id=p_id;
 if found then
  if anterior.produto_id<>p_produto or anterior.tipo<>p_tipo or anterior.quantidade<>p_quantidade or anterior.ocorrido_em<>p_data or anterior.motivo<>p_motivo or anterior.fornecedor<>coalesce(p_fornecedor,'') or anterior.usuario_id is distinct from p_usuario or (p_tipo='entrada' and anterior.custo_unitario is distinct from p_custo) then raise exception 'Esta identificação já foi usada em outra movimentação. Atualize a página.'; end if;
  return to_jsonb(anterior);
 end if;
 if not p.ativo then raise exception 'Reative o produto antes de movimentar.'; end if;
 if p_tipo='entrada' then
  if p_custo is null or p_custo<0 or p_custo>999999.9999 or p_custo<>round(p_custo,4) then raise exception 'Informe um custo unitário válido.'; end if;
  valor=round(p_quantidade*p_custo,4); nova_q=p.quantidade+p_quantidade; novo_valor=p.valor_estoque+valor; custo=p_custo;
 else
  if p_quantidade>p.quantidade then raise exception 'Saldo insuficiente. Confira a quantidade disponível.'; end if;
  custo=p.custo_medio;
  valor=case when p_quantidade=p.quantidade then p.valor_estoque else round(p.custo_medio*p_quantidade,4) end;
  nova_q=p.quantidade-p_quantidade; novo_valor=p.valor_estoque-valor;
 end if;
 if nova_q>999999999.999 or novo_valor>99999999999999.9999 then raise exception 'Esta movimentação excede o limite de saldo do produto.'; end if;
 update public.estoque_produtos set quantidade=nova_q,valor_estoque=novo_valor where id=p_produto;
 insert into public.estoque_movimentos(id,produto_id,tipo,quantidade,custo_unitario,valor_total,saldo_apos,ocorrido_em,motivo,fornecedor,usuario_id)
 values(p_id,p_produto,p_tipo,p_quantidade,custo,valor,nova_q,p_data,btrim(p_motivo),coalesce(p_fornecedor,''),p_usuario) returning * into anterior;
 return to_jsonb(anterior);
end $$;
revoke all on function public.kahenna_movimentar_estoque(uuid,uuid,text,numeric,numeric,date,text,text,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_movimentar_estoque(uuid,uuid,text,numeric,numeric,date,text,text,uuid) to service_role;
create function public.kahenna_estoque_resumo(p_inicio date,p_fim date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'produtos_ativos',(select count(*) from public.estoque_produtos where ativo),
  'repor',(select count(*) from public.estoque_produtos where ativo and precisa_repor),
  'sem_estoque',(select count(*) from public.estoque_produtos where ativo and quantidade=0),
  'valor_estoque',(select coalesce(sum(valor_estoque),0) from public.estoque_produtos where ativo),
  'compras_mes',(select coalesce(sum(valor_total),0) from public.estoque_movimentos where tipo='entrada' and ocorrido_em>=p_inicio and ocorrido_em<p_fim),
  'uso_mes',(select coalesce(sum(valor_total),0) from public.estoque_movimentos where tipo='saida' and ocorrido_em>=p_inicio and ocorrido_em<p_fim),
  'categorias',(select coalesce(jsonb_agg(categoria order by categoria),'[]'::jsonb) from (select distinct categoria from public.estoque_produtos) c)
 );
$$;
revoke all on function public.kahenna_estoque_resumo(date,date) from public,anon,authenticated;
grant execute on function public.kahenna_estoque_resumo(date,date) to service_role;
commit;
