-- Least-privilege access for cashier accounts.
drop policy if exists sales_read_staff on public.sales;
create policy sales_read_staff on public.sales
for select to authenticated
using (public.current_app_role() = any (array['admin','manager']::text[]) or sold_by = (select auth.uid()));

drop policy if exists sale_items_read_staff on public.sale_items;
create policy sale_items_read_staff on public.sale_items
for select to authenticated
using (public.current_app_role() = any (array['admin','manager']::text[]) or exists (select 1 from public.sales s where s.id = sale_items.sale_id and s.sold_by = (select auth.uid())));

drop policy if exists sale_payments_read_staff on public.sale_payments;
create policy sale_payments_read_staff on public.sale_payments
for select to authenticated
using (public.current_app_role() = any (array['admin','manager']::text[]) or exists (select 1 from public.sales s where s.id = sale_payments.sale_id and s.sold_by = (select auth.uid())));

drop policy if exists customers_insert_manage on public.customers;
drop policy if exists customers_update_manage on public.customers;
drop policy if exists customers_delete_manage on public.customers;
create policy customers_insert_manage on public.customers for insert to authenticated with check (public.current_app_role() = any (array['admin','manager']::text[]));
create policy customers_update_manage on public.customers for update to authenticated using (public.current_app_role() = any (array['admin','manager']::text[])) with check (public.current_app_role() = any (array['admin','manager']::text[]));
create policy customers_delete_manage on public.customers for delete to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));

drop policy if exists inventory_adjustments_read_staff on public.inventory_adjustments;
create policy inventory_adjustments_read_staff on public.inventory_adjustments for select to authenticated using (public.current_app_role() = any (array['admin','manager','inventory']::text[]));

drop policy if exists sale_returns_read_staff on public.sale_returns;
create policy sale_returns_read_staff on public.sale_returns for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));
drop policy if exists sale_return_items_read_staff on public.sale_return_items;
create policy sale_return_items_read_staff on public.sale_return_items for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));
drop policy if exists sale_return_payments_read_staff on public.sale_return_payments;
create policy sale_return_payments_read_staff on public.sale_return_payments for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));

drop policy if exists sales_create_staff on public.sales;
drop policy if exists sale_items_create_staff on public.sale_items;
drop policy if exists sale_payments_create_staff on public.sale_payments;
