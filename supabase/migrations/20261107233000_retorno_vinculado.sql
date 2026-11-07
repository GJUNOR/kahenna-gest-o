alter table public.agendamentos add column if not exists retorno_de bigint references public.agendamentos(id);
create unique index if not exists agendamentos_retorno_ativo_unico on public.agendamentos(retorno_de) where retorno_de is not null and status <> 'cancelado';
