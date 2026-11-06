alter table public.estoque_produtos
add column if not exists nome_busca text generated always as (
  regexp_replace(normalize(nome, NFD), U&'[\0300-\036F]', '', 'g')
) stored;
