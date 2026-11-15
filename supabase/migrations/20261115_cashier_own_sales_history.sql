-- Allow cashiers to read only their own completed sales and reprint tickets.
drop policy if exists sales_read_staff on public.sales;
create policy sales_read_own_or_managers on public.sales for select to authenticated
using (sold_by = auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists sale_items_read_staff on public.sale_items;
create policy sale_items_read_own_or_managers on public.sale_items for select to authenticated
using (exists(select 1 from public.sales s where s.id=sale_items.sale_id and (s.sold_by=auth.uid() or public.current_app_role() in ('admin','manager'))));
drop policy if exists sale_payments_read_staff on public.sale_payments;
create policy sale_payments_read_own_or_managers on public.sale_payments for select to authenticated
using (exists(select 1 from public.sales s where s.id=sale_payments.sale_id and (s.sold_by=auth.uid() or public.current_app_role() in ('admin','manager'))));
create or replace function public.get_my_sales_history(p_from timestamptz default now()-interval '30 days', p_to timestamptz default now())
returns table(id uuid,sale_number bigint,status text,subtotal numeric,discount numeric,total numeric,amount_paid numeric,change_due numeric,sold_at timestamptz,items jsonb,payments jsonb)
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_role text;
begin
 if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
 select role into v_role from public.profiles where id=v_uid and active=true;
 if coalesce(v_role,'') not in ('cashier','admin','manager') then raise exception 'No tienes permiso para consultar ventas.'; end if;
 return query
 select s.id,s.sale_number,s.status,s.subtotal,s.discount,s.total,s.amount_paid,s.change_due,s.sold_at,
 coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'quantity',si.quantity,'unit_price',si.unit_price,'line_total',si.line_total) order by si.id) from public.sale_items si join public.products p on p.id=si.product_id where si.sale_id=s.id),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('method',sp.method,'amount',sp.amount) order by sp.id) from public.sale_payments sp where sp.sale_id=s.id),'[]'::jsonb)
 from public.sales s
 where s.sold_at>=p_from and s.sold_at<=p_to
 and (s.sold_by=v_uid or v_role in ('admin','manager'))
 order by s.sold_at desc limit 500;
end $$;
revoke all on function public.get_my_sales_history(timestamptz,timestamptz) from public;
grant execute on function public.get_my_sales_history(timestamptz,timestamptz) to authenticated;
