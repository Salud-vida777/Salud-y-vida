create or replace function public.reset_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_iat bigint;
  v_table text;
  v_counts jsonb := '{}'::jsonb;
  v_count bigint;
  v_tables text[] := array[
    'sale_return_payments','sale_return_items','sale_returns',
    'sale_payments','sale_items','sales',
    'purchase_payments','purchase_items','purchases',
    'cash_movements','cash_sessions','general_cash_movements',
    'inventory_adjustments','product_batches','products',
    'expense_records','suppliers','customers','categories','audit_logs'
  ];
begin
  if v_uid is null then raise exception 'Debes iniciar sesión como administrador.'; end if;
  select role into v_role from public.profiles where id=v_uid and active=true;
  if coalesce(v_role,'')<>'admin' then raise exception 'Solo el administrador principal puede reiniciar los datos.'; end if;
  v_iat := nullif(auth.jwt()->>'iat','')::bigint;
  if v_iat is null or v_iat < extract(epoch from now())::bigint - 300 then
    raise exception 'Por seguridad, confirma nuevamente tu contraseña de administrador e inténtalo otra vez.';
  end if;
  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I',v_table) into v_count;
    v_counts := jsonb_set(v_counts,array[v_table],to_jsonb(v_count),true);
  end loop;
  truncate table
    public.sale_return_payments,public.sale_return_items,public.sale_returns,
    public.sale_payments,public.sale_items,public.sales,
    public.purchase_payments,public.purchase_items,public.purchases,
    public.cash_movements,public.cash_sessions,public.general_cash_movements,
    public.inventory_adjustments,public.product_batches,public.products,
    public.expense_records,public.suppliers,public.customers,public.categories,public.audit_logs
  restart identity cascade;
  return jsonb_build_object('success',true,'deleted_by_table',v_counts,'deleted_at',now(),'profiles_preserved',true,'auth_users_preserved',true);
end;
$function$;
revoke all on function public.reset_operational_data() from public,anon;
grant execute on function public.reset_operational_data() to authenticated;
