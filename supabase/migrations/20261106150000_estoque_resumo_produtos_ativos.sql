create or replace function public.kahenna_estoque_resumo(p_inicio date,p_fim date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'produtos_ativos',(select count(*) from public.estoque_produtos where ativo),
  'repor',(select count(*) from public.estoque_produtos where ativo and precisa_repor),
  'sem_estoque',(select count(*) from public.estoque_produtos where ativo and quantidade=0),
  'valor_estoque',(select coalesce(sum(valor_estoque),0) from public.estoque_produtos where ativo),
  'compras_mes',(select coalesce(sum(valor_total),0) from public.estoque_movimentos m join public.estoque_produtos p on p.id=m.produto_id and p.ativo where m.tipo='entrada' and ocorrido_em>=p_inicio and ocorrido_em<p_fim),
  'uso_mes',(select coalesce(sum(valor_total),0) from public.estoque_movimentos m join public.estoque_produtos p on p.id=m.produto_id and p.ativo where m.tipo='saida' and ocorrido_em>=p_inicio and ocorrido_em<p_fim),
  'categorias',(select coalesce(jsonb_agg(categoria order by categoria),'[]'::jsonb) from (select distinct categoria from public.estoque_produtos where ativo) c)
 );
$$;
