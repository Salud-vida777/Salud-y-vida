create or replace function public.get_pos_catalog()
returns table(id uuid,name text,sku text,barcode text,sale_price numeric,image_urls text[],available_stock numeric)
language plpgsql stable security definer
set search_path=public,auth,pg_temp
set TimeZone='America/Guatemala' as $$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.';end if;
 select pr.role into v_role from public.profiles pr where pr.id=auth.uid() and pr.active=true;
 if coalesce(v_role,'') not in ('admin','manager','cashier') then raise exception 'No tienes permiso para consultar el catálogo de ventas.';end if;
 return query
 select p.id,p.name,p.sku,p.barcode,p.sale_price,p.image_urls,
  coalesce(sum(b.quantity) filter(where b.quantity>0 and (b.expiration_date is null or b.expiration_date>=current_date)),0)::numeric
 from public.products p left join public.product_batches b on b.product_id=p.id
 where p.active=true group by p.id order by p.name;
end $$;
revoke all on function public.get_pos_catalog() from public,anon;
grant execute on function public.get_pos_catalog() to authenticated;
