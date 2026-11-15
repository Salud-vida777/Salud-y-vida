create table if not exists public.purchase_payments(
 id uuid primary key default gen_random_uuid(),
 purchase_id uuid not null references public.purchases(id) on delete restrict,
 method text not null check(method in ('cash','transfer')),
 amount numeric(12,2) not null check(amount>0),
 reference text,
 paid_by uuid not null references auth.users(id),
 paid_at timestamptz not null default now()
);
alter table public.purchase_payments enable row level security;
revoke all on public.purchase_payments from anon,authenticated;
grant select on public.purchase_payments to authenticated;
drop policy if exists purchase_payments_read_admin on public.purchase_payments;
create policy purchase_payments_read_admin on public.purchase_payments
for select to authenticated using(public.current_app_role() in ('admin','manager'));

do $$ begin
 if not exists(select 1 from pg_constraint where conname='purchases_payment_status_valid' and conrelid='public.purchases'::regclass) then
  alter table public.purchases add constraint purchases_payment_status_valid check(payment_status in ('pending','partial','paid'));
 end if;
end $$;

create or replace function public.record_purchase_payment(
 p_purchase_id uuid,p_amount numeric,p_method text,p_reference text default null
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 v_uid uuid:=auth.uid();v_role text;v_purchase public.purchases%rowtype;
 v_paid numeric;v_balance numeric;v_cash_balance numeric;v_payment_id uuid;v_status text;
begin
 if v_uid is null then raise exception 'Debes iniciar sesión.';end if;
 select pr.role into v_role from public.profiles pr where pr.id=v_uid and pr.active=true;
 if coalesce(v_role,'') not in ('admin','manager') then raise exception 'Solo administración puede registrar pagos a proveedores.';end if;
 if p_amount is null or p_amount<=0 or p_method not in ('cash','transfer') then raise exception 'Monto o forma de pago inválidos.';end if;
 select * into v_purchase from public.purchases where id=p_purchase_id for update;
 if not found then raise exception 'No se encontró la compra.';end if;
 if v_purchase.payment_method<>'credit' then raise exception 'Esta compra no está registrada a crédito.';end if;
 select coalesce(sum(pp.amount),0) into v_paid from public.purchase_payments pp where pp.purchase_id=p_purchase_id;
 v_balance:=round(v_purchase.total-v_paid,2);
 if p_amount>v_balance then raise exception 'El pago supera el saldo pendiente (Q %).',to_char(v_balance,'FM999999990.00');end if;
 if p_method='cash' then
  lock table public.general_cash_movements in share row exclusive mode;
  select coalesce(sum(case when type='in' then amount else -amount end),0) into v_cash_balance from public.general_cash_movements;
  if p_amount>v_cash_balance then raise exception 'La caja general no tiene efectivo suficiente (Q %).',to_char(v_cash_balance,'FM999999990.00');end if;
 end if;
 insert into public.purchase_payments(purchase_id,method,amount,reference,paid_by)
 values(p_purchase_id,p_method,round(p_amount,2),nullif(trim(coalesce(p_reference,'')),''),v_uid)
 returning id into v_payment_id;
 v_paid:=v_paid+round(p_amount,2);
 v_status:=case when v_paid>=v_purchase.total then 'paid' else 'partial' end;
 update public.purchases set payment_status=v_status where id=p_purchase_id;
 if p_method='cash' then
  insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
  values('out',round(p_amount,2),'Abono a compra a crédito '||coalesce(nullif(v_purchase.invoice_number,''),p_purchase_id::text),'purchase_payment',v_payment_id,v_uid);
 end if;
 insert into public.audit_logs(user_id,action,entity,entity_id,details)
 values(v_uid,'purchase_payment','purchase',p_purchase_id::text,jsonb_build_object('payment_id',v_payment_id,'amount',round(p_amount,2),'method',p_method,'status',v_status));
 return jsonb_build_object('success',true,'payment_id',v_payment_id,'paid_total',v_paid,'remaining',round(v_purchase.total-v_paid,2),'payment_status',v_status);
end $$;
revoke all on function public.record_purchase_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.record_purchase_payment(uuid,numeric,text,text) to authenticated;
create index if not exists purchase_payments_purchase_id_paid_at_idx on public.purchase_payments(purchase_id,paid_at desc);
