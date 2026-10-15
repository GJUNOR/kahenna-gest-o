-- Revoke browser access to the default RLS event-trigger function.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
