alter function public.restore_business_backup(jsonb) rename to restore_business_backup_base;
revoke all on function public.restore_business_backup_base(jsonb) from public,anon,authenticated;

create or replace function public.restore_business_backup(p_tables jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
 v_result jsonb;v_row jsonb;v_count integer;v_total integer:=0;v_uid uuid:=auth.uid();v_role text;
 v_counts jsonb:='{}'::jsonb;
begin
 select pr.role into v_role from public.profiles pr where pr.id=v_uid and pr.active=true;
 if v_uid is null or coalesce(v_role,'')<>'admin' then raise exception 'Solo el administrador principal puede restaurar datos.';end if;
 v_result:=public.restore_business_backup_base(p_tables);
 if p_tables ? 'purchase_payments' then
  if jsonb_typeof(p_tables->'purchase_payments')<>'array' then raise exception 'La sección purchase_payments no es una lista válida.';end if;
  for v_row in select value from jsonb_array_elements(p_tables->'purchase_payments') loop
   insert into public.purchase_payments select (jsonb_populate_record(null::public.purchase_payments,v_row)).* on conflict do nothing;
   get diagnostics v_count=row_count;v_total:=v_total+v_count;
  end loop;
 end if;
 v_counts:=coalesce(v_result->'inserted_by_table','{}'::jsonb)||jsonb_build_object('purchase_payments',v_total);
 return v_result||jsonb_build_object('inserted_records',coalesce((v_result->>'inserted_records')::integer,0)+v_total,'inserted_by_table',v_counts);
end $$;
revoke all on function public.restore_business_backup(jsonb) from public,anon;
grant execute on function public.restore_business_backup(jsonb) to authenticated;
