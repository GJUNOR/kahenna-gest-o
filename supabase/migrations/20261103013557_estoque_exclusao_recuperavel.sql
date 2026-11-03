begin;
-- Exclusão recuperável: mantém saldo, custo e movimentos para restauração.
-- O resumo já considera somente produtos ativos no valor disponível/reposição.
-- Compras e usos históricos continuam contando no mês original.
alter table public.estoque_produtos drop constraint if exists estoque_produtos_check;
comment on column public.estoque_produtos.ativo is
 'false: excluído da lista ativa, recuperável com saldo e histórico preservados';
commit;
