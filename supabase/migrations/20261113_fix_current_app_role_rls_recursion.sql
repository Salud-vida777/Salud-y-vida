-- Fix recursive RLS evaluation in current_app_role().
-- profiles policies call this helper; it must read profiles without re-entering RLS.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
  limit 1
$function$;

revoke all on function public.current_app_role() from public;
revoke all on function public.current_app_role() from anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_role() to service_role;
