-- Capture catalog changes in the existing audit log without storing customer PII.
create or replace function public.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_row jsonb;
  v_old jsonb;
  v_id text;
  v_fields text[];
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_old := v_row;
  elsif tg_op = 'UPDATE' then
    v_row := to_jsonb(new);
    v_old := to_jsonb(old);
  else
    v_row := to_jsonb(new);
    v_old := '{}'::jsonb;
  end if;
  v_id := coalesce(v_row->>'id', v_old->>'id');
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), array[]::text[]) into v_fields
    from jsonb_object_keys(v_row) as k
    where v_row->k is distinct from v_old->k and k not in ('updated_at');
  elsif tg_op = 'INSERT' then
    select coalesce(array_agg(k order by k), array[]::text[]) into v_fields
    from jsonb_object_keys(v_row) as k where k not in ('created_at','updated_at');
  else
    select coalesce(array_agg(k order by k), array[]::text[]) into v_fields
    from jsonb_object_keys(v_old) as k where k not in ('created_at','updated_at');
  end if;
  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id,
    jsonb_build_object('changed_fields', v_fields));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function public.audit_catalog_change() from public, anon, authenticated;
drop trigger if exists audit_products_changes on public.products;
create trigger audit_products_changes after insert or update or delete on public.products
for each row execute function public.audit_catalog_change();
drop trigger if exists audit_categories_changes on public.categories;
create trigger audit_categories_changes after insert or update or delete on public.categories
for each row execute function public.audit_catalog_change();
drop trigger if exists audit_suppliers_changes on public.suppliers;
create trigger audit_suppliers_changes after insert or update or delete on public.suppliers
for each row execute function public.audit_catalog_change();
drop trigger if exists audit_customers_changes on public.customers;
create trigger audit_customers_changes after insert or update or delete on public.customers
for each row execute function public.audit_catalog_change();
