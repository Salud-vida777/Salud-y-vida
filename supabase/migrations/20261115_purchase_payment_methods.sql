create or replace function public.receive_purchase_with_payment(p_supplier_id uuid,p_invoice_number text,p_items jsonb,p_discount numeric default 0,p_notes text default null,p_payment_method text default 'cash')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_role text;v_result jsonb;v_purchase uuid;v_total numeric;v_balance numeric;
begin
 select pr.role into v_role from public.profiles pr where pr.id=auth.uid() and pr.active=true;
 if auth.uid() is null or coalesce(v_role,'') not in ('admin','manager','inventory') then raise exception 'No tienes permiso para registrar compras.'; end if;
 if p_payment_method not in ('cash','transfer','credit') then raise exception 'Método de pago inválido.'; end if;
 if p_payment_method='cash' then lock table public.general_cash_movements in share row exclusive mode; end if;
 v_result:=public.receive_purchase(p_supplier_id,p_invoice_number,p_items,p_discount,p_notes);
 v_purchase:=(v_result->>'purchase_id')::uuid;v_total:=(v_result->>'total')::numeric;
 if p_payment_method='cash' then
  select coalesce(sum(case when type='in' then amount else -amount end),0) into v_balance from public.general_cash_movements;
  if v_total>v_balance then raise exception 'La compra supera el efectivo disponible en caja general (Q %).',to_char(v_balance,'FM999999990.00'); end if;
 end if;
 update public.purchases set payment_method=p_payment_method,payment_status=case when p_payment_method='credit' then 'pending' else 'paid' end where id=v_purchase;
 if p_payment_method='cash' then
  insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by) values('out',v_total,'Compra '||coalesce(nullif(p_invoice_number,''),'sin factura'),'purchase',v_purchase,auth.uid());
 end if;
 return v_result||jsonb_build_object('payment_method',p_payment_method,'payment_status',case when p_payment_method='credit' then 'pending' else 'paid' end);
end $$;
revoke all on function public.receive_purchase_with_payment(uuid,text,jsonb,numeric,text,text) from public;
grant execute on function public.receive_purchase_with_payment(uuid,text,jsonb,numeric,text,text) to authenticated;
