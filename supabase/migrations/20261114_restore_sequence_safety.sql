-- Keep generated receipt and audit numbers above restored values.
create or replace function public.restore_business_backup(p_tables jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_uid uuid := auth.uid(); v_role text; v_table text; v_row jsonb;
  v_count integer; v_total integer := 0; v_counts jsonb := '{}'::jsonb; v_sequence text;
  v_tables text[] := array['categories','suppliers','customers','products','product_batches','purchases','purchase_items','sales','sale_items','sale_payments','sale_returns','sale_return_items','sale_return_payments','cash_sessions','cash_movements','inventory_adjustments','audit_logs'];
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
  select role into v_role from public.profiles where id=v_uid and active=true;
  if coalesce(v_role,'') <> 'admin' then raise exception 'Solo el administrador principal puede restaurar datos.'; end if;
  if jsonb_typeof(p_tables) <> 'object' then raise exception 'El archivo de respaldo no contiene un objeto de tablas válido.'; end if;
  foreach v_table in array v_tables loop
    if p_tables ? v_table then
      if jsonb_typeof(p_tables->v_table) <> 'array' then raise exception 'La sección % no es una lista válida.',v_table; end if;
      for v_row in select value from jsonb_array_elements(p_tables->v_table) loop
        execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* on conflict do nothing',v_table,v_table) using v_row;
        get diagnostics v_count = row_count;
        v_total:=v_total+v_count;
        v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(coalesce((v_counts->>v_table)::integer,0)+v_count),true);
      end loop;
    end if;
  end loop;
  v_sequence:=pg_get_serial_sequence('public.audit_logs','id');
  if v_sequence is not null then perform setval(v_sequence,greatest(coalesce((select max(id) from public.audit_logs),1),1),exists(select 1 from public.audit_logs)); end if;
  v_sequence:=pg_get_serial_sequence('public.sales','sale_number');
  if v_sequence is not null then perform setval(v_sequence,greatest(coalesce((select max(sale_number) from public.sales),1),1),exists(select 1 from public.sales)); end if;
  v_sequence:=pg_get_serial_sequence('public.sale_returns','return_number');
  if v_sequence is not null then perform setval(v_sequence,greatest(coalesce((select max(return_number) from public.sale_returns),1),1),exists(select 1 from public.sale_returns)); end if;
  return jsonb_build_object('success',true,'inserted_records',v_total,'inserted_by_table',v_counts,'mode','append_only','profiles_skipped',true);
end;
$function$;
revoke all on function public.restore_business_backup(jsonb) from public,anon;
grant execute on function public.restore_business_backup(jsonb) to authenticated;
