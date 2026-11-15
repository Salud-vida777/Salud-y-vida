drop policy if exists products_read_staff on public.products;
create policy products_read_staff on public.products for select to authenticated using (public.current_app_role() = any (array['admin','manager','inventory']::text[]));
drop policy if exists batches_read_staff on public.product_batches;
create policy batches_read_staff on public.product_batches for select to authenticated using (public.current_app_role() = any (array['admin','manager','inventory']::text[]));
drop policy if exists categories_read_staff on public.categories;
create policy categories_read_staff on public.categories for select to authenticated using (public.current_app_role() = any (array['admin','manager','inventory']::text[]));
drop policy if exists customers_read_staff on public.customers;
create policy customers_read_staff on public.customers for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));
drop policy if exists sales_read_staff on public.sales;
create policy sales_read_staff on public.sales for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));
drop policy if exists sale_items_read_staff on public.sale_items;
create policy sale_items_read_staff on public.sale_items for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));
drop policy if exists sale_payments_read_staff on public.sale_payments;
create policy sale_payments_read_staff on public.sale_payments for select to authenticated using (public.current_app_role() = any (array['admin','manager']::text[]));
create or replace function public.get_pos_catalog()
returns table (id uuid, name text, sku text, barcode text, sale_price numeric, image_urls text[], available_stock numeric)
language plpgsql stable security definer set search_path = public, auth, pg_temp
as $function$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 select role into v_role from public.profiles where id=auth.uid() and active=true;
 if coalesce(v_role,'') not in ('admin','manager','cashier') then raise exception 'No tienes permiso para consultar el catálogo de ventas.'; end if;
 return query select p.id,p.name,p.sku,p.barcode,p.sale_price,p.image_urls,coalesce(sum(b.quantity) filter (where b.quantity>0 and (b.expiration_date is null or b.expiration_date>=current_date)),0)::numeric from public.products p left join public.product_batches b on b.product_id=p.id where p.active=true group by p.id order by p.name;
end;
$function$;
create or replace function public.get_pos_customers()
returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public, auth, pg_temp
as $function$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 select role into v_role from public.profiles where id=auth.uid() and active=true;
 if coalesce(v_role,'') not in ('admin','manager','cashier') then raise exception 'No tienes permiso para consultar clientes del punto de venta.'; end if;
 return query select c.id,c.full_name from public.customers c order by c.full_name;
end;
$function$;
revoke all on function public.get_pos_catalog() from public, anon;
revoke all on function public.get_pos_customers() from public, anon;
grant execute on function public.get_pos_catalog() to authenticated;
grant execute on function public.get_pos_customers() to authenticated;