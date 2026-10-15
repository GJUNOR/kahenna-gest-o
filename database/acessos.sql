-- Server-only login aliases for the exclusive Kahenna project.
create table public.acessos (
 user_id uuid primary key references auth.users(id) on delete cascade,
 usuario text not null unique check(usuario=lower(usuario) and usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
 criado_em timestamptz not null default now()
);
alter table public.acessos enable row level security;
revoke all on public.acessos from anon,authenticated;
grant select,insert,update,delete on public.acessos to service_role;
notify pgrst,'reload schema';
