drop policy if exists general_cash_movements_read_admin on public.general_cash_movements;
create policy general_cash_movements_read_admin on public.general_cash_movements
for select to authenticated using(public.current_app_role() in ('admin','manager'));

create or replace function public.restore_business_backup(p_tables jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
 v_result jsonb;v_row jsonb;v_count integer;v_total integer:=0;v_uid uuid:=auth.uid();v_role text;
 v_counts jsonb:='{}'::jsonb;v_table text;v_table_count integer;
begin
 select pr.role into v_role from public.profiles pr where pr.id=v_uid and pr.active=true;
 if v_uid is null or coalesce(v_role,'')<>'admin' then raise exception 'Solo el administrador principal puede restaurar datos.';end if;
 if jsonb_typeof(p_tables)<>'object' then raise exception 'El archivo de respaldo no contiene un objeto válido.';end if;
 v_result:=public.restore_business_backup_base(p_tables);
 foreach v_table in array array['purchase_payments','general_cash_movements'] loop
  v_table_count:=0;
  if p_tables ? v_table then
   if jsonb_typeof(p_tables->v_table)<>'array' then raise exception 'La sección % no es una lista válida.',v_table;end if;
   for v_row in select value from jsonb_array_elements(p_tables->v_table) loop
    if v_table='purchase_payments' then
     insert into public.purchase_payments select (jsonb_populate_record(null::public.purchase_payments,v_row)).* on conflict do nothing;
    else
     insert into public.general_cash_movements select (jsonb_populate_record(null::public.general_cash_movements,v_row)).* on conflict do nothing;
    end if;
    get diagnostics v_count=row_count;v_table_count:=v_table_count+v_count;
   end loop;
  end if;
  v_total:=v_total+v_table_count;
  v_counts:=v_counts||jsonb_build_object(v_table,v_table_count);
 end loop;
 return v_result||jsonb_build_object('inserted_records',coalesce((v_result->>'inserted_records')::integer,0)+v_total,'inserted_by_table',coalesce(v_result->'inserted_by_table','{}'::jsonb)||v_counts);
end $$;
revoke all on function public.restore_business_backup(jsonb) from public,anon;
grant execute on function public.restore_business_backup(jsonb) to authenticated;
