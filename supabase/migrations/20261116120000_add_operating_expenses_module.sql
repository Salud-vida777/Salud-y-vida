create table if not exists public.expense_records (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Servicios','Personal','Limpieza','Alquiler','Mantenimiento','Administración','Transporte','Otros')),
  description text not null check (length(trim(description)) between 2 and 240),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default (now() at time zone 'America/Guatemala')::date,
  payment_method text not null check (payment_method in ('cash','transfer')),
  receipt_reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists expense_records_expense_date_idx on public.expense_records(expense_date desc);
create index if not exists expense_records_created_by_idx on public.expense_records(created_by);
alter table public.expense_records enable row level security;
revoke all on public.expense_records from anon, authenticated;
grant select on public.expense_records to authenticated;
create policy "Admin and manager read expenses" on public.expense_records for select to authenticated using (public.current_app_role() in ('admin','manager'));
revoke insert, update, delete on public.expense_records from anon, authenticated;

create or replace function public.record_expense(
 p_category text,p_description text,p_amount numeric,p_expense_date date,p_payment_method text,
 p_receipt_reference text default null,p_notes text default null
) returns public.expense_records
language plpgsql security definer set search_path=pg_catalog,public,auth
as $function$
declare v_uid uuid:=auth.uid();v_role text;v_expense public.expense_records;
begin
 if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
 select role into v_role from public.profiles where id=v_uid and active=true;
 if coalesce(v_role,'') not in ('admin','manager') then raise exception 'No tienes permiso para registrar gastos.'; end if;
 if p_category not in ('Servicios','Personal','Limpieza','Alquiler','Mantenimiento','Administración','Transporte','Otros') then raise exception 'Selecciona una categoría válida.'; end if;
 if p_payment_method not in ('cash','transfer') then raise exception 'Forma de pago no válida.'; end if;
 if p_amount is null or p_amount<=0 or p_amount>100000000 then raise exception 'El importe debe ser mayor que cero.'; end if;
 if p_description is null or length(trim(p_description)) not between 2 and 240 then raise exception 'Escribe una descripción de entre 2 y 240 caracteres.'; end if;
 insert into public.expense_records(category,description,amount,expense_date,payment_method,receipt_reference,notes,created_by)
 values(p_category,trim(p_description),round(p_amount,2),coalesce(p_expense_date,(now() at time zone 'America/Guatemala')::date),p_payment_method,nullif(trim(coalesce(p_receipt_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),v_uid)
 returning * into v_expense;
 if p_payment_method='cash' then
  insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
  values('out',v_expense.amount,'Gasto: '||v_expense.category||' · '||v_expense.description,'expense',v_expense.id,v_uid);
 end if;
 insert into public.audit_logs(user_id,action,entity,entity_id,details)
 values(v_uid,'create','expense_records',v_expense.id::text,jsonb_build_object('category',v_expense.category,'description',v_expense.description,'amount',v_expense.amount,'payment_method',v_expense.payment_method,'expense_date',v_expense.expense_date));
 return v_expense;
end;
$function$;
revoke all on function public.record_expense(text,text,numeric,date,text,text,text) from public,anon;
grant execute on function public.record_expense(text,text,numeric,date,text,text,text) to authenticated;

create or replace function public.restore_business_backup_base(p_tables jsonb)
 returns jsonb language plpgsql security definer
 set search_path to 'pg_catalog','public','auth'
as $function$
declare
 v_uid uuid:=auth.uid();v_role text;v_table text;v_row jsonb;v_count integer;v_total integer:=0;v_counts jsonb:='{}'::jsonb;v_sequence text;
 v_tables text[]:=array['categories','suppliers','customers','products','product_batches','purchases','purchase_items','sales','sale_items','sale_payments','sale_returns','sale_return_items','sale_return_payments','cash_sessions','cash_movements','inventory_adjustments','audit_logs','expense_records'];
begin
 if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
 select role into v_role from public.profiles where id=v_uid and active=true;
 if coalesce(v_role,'')<>'admin' then raise exception 'Solo el administrador principal puede restaurar datos.'; end if;
 if jsonb_typeof(p_tables)<>'object' then raise exception 'El archivo de respaldo no contiene un objeto de tablas válido.'; end if;
 foreach v_table in array v_tables loop
  if p_tables ? v_table then
   if jsonb_typeof(p_tables->v_table)<>'array' then raise exception 'La sección % no es una lista válida.',v_table; end if;
   for v_row in select value from jsonb_array_elements(p_tables->v_table) loop
    execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* on conflict do nothing',v_table,v_table) using v_row;
    get diagnostics v_count=row_count;v_total:=v_total+v_count;
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