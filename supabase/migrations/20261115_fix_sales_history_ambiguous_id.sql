-- Fix PL/pgSQL output-column ambiguity in the cashier sales history function.
create or replace function public.get_my_sales_history(p_from timestamptz default now()-interval '30 days', p_to timestamptz default now())
returns table(id uuid,sale_number bigint,status text,subtotal numeric,discount numeric,total numeric,amount_paid numeric,change_due numeric,sold_at timestamptz,items jsonb,payments jsonb)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select pr.role into v_role
  from public.profiles as pr
  where pr.id = v_uid and pr.active = true;

  if coalesce(v_role,'') not in ('cashier','admin','manager') then
    raise exception 'No tienes permiso para consultar ventas.';
  end if;

  return query
  select s.id,s.sale_number,s.status,s.subtotal,s.discount,s.total,s.amount_paid,s.change_due,s.sold_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('name',p.name,'quantity',si.quantity,'unit_price',si.unit_price,'line_total',si.line_total) order by si.id)
      from public.sale_items as si
      join public.products as p on p.id=si.product_id
      where si.sale_id=s.id
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('method',sp.method,'amount',sp.amount) order by sp.id)
      from public.sale_payments as sp
      where sp.sale_id=s.id
    ),'[]'::jsonb)
  from public.sales as s
  where s.sold_at>=p_from and s.sold_at<=p_to
    and (s.sold_by=v_uid or v_role in ('admin','manager'))
  order by s.sold_at desc
  limit 500;
end;
$$;

revoke all on function public.get_my_sales_history(timestamptz,timestamptz) from public;
grant execute on function public.get_my_sales_history(timestamptz,timestamptz) to authenticated;
