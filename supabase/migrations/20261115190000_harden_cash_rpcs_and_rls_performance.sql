-- Hardening: ninguna RPC SECURITY DEFINER debe ser invocable sin sesión.
revoke execute on function public.get_general_cash_summary() from public, anon;
revoke execute on function public.get_my_sales_history(timestamptz,timestamptz) from public, anon;
revoke execute on function public.get_pending_worker_deliveries() from public, anon;
revoke execute on function public.receive_purchase_with_payment(uuid,text,jsonb,numeric,text,text) from public, anon;
revoke execute on function public.receive_worker_cash_delivery(uuid,numeric) from public, anon;
revoke execute on function public.record_general_cash_movement(text,numeric,text) from public, anon;
grant execute on function public.get_general_cash_summary() to authenticated;
grant execute on function public.get_my_sales_history(timestamptz,timestamptz) to authenticated;
grant execute on function public.get_pending_worker_deliveries() to authenticated;
grant execute on function public.receive_purchase_with_payment(uuid,text,jsonb,numeric,text,text) to authenticated;
grant execute on function public.receive_worker_cash_delivery(uuid,numeric) to authenticated;
grant execute on function public.record_general_cash_movement(text,numeric,text) to authenticated;

-- La recepción antigua sin método de pago no debe poder saltarse el libro de caja.
revoke execute on function public.receive_purchase(uuid,text,jsonb,numeric,text) from public, anon, authenticated;

-- Esta función solo debe ejecutarse desde su trigger, nunca como RPC.
revoke execute on function public.mirror_admin_cash_movement_to_general() from public, anon, authenticated;

-- El helper de RLS solo debe exponerse a usuarios autenticados.
revoke execute on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create index if not exists general_cash_movements_created_by_idx
  on public.general_cash_movements(created_by);
create index if not exists general_cash_movements_source_reference_idx
  on public.general_cash_movements(source, reference_id);

drop policy if exists sales_read_own_or_managers on public.sales;
create policy sales_read_own_or_managers on public.sales
for select to authenticated
using (sold_by = (select auth.uid()) or public.current_app_role() in ('admin','manager'));

drop policy if exists sale_items_read_own_or_managers on public.sale_items;
create policy sale_items_read_own_or_managers on public.sale_items
for select to authenticated
using (exists(select 1 from public.sales s where s.id=sale_items.sale_id and (s.sold_by=(select auth.uid()) or public.current_app_role() in ('admin','manager'))));

drop policy if exists sale_payments_read_own_or_managers on public.sale_payments;
create policy sale_payments_read_own_or_managers on public.sale_payments
for select to authenticated
using (exists(select 1 from public.sales s where s.id=sale_payments.sale_id and (s.sold_by=(select auth.uid()) or public.current_app_role() in ('admin','manager'))));
