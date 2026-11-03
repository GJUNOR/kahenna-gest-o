begin;
-- Somente cadastros ativos reservam o nome. O histórico mantém os IDs antigos.
drop index public.estoque_produtos_nome_idx;
create unique index estoque_produtos_nome_idx
 on public.estoque_produtos(lower(btrim(nome))) where ativo;
commit;
