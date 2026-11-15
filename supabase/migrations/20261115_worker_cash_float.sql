create or replace function public.open_cash_session(p_opening_amount numeric)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid();v_role text;v_id uuid;v_balance numeric;
begin
 if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
 select pr.role into v_role from public.profiles pr where pr.id=v_uid and pr.active=true;
 if coalesce(v_role,'') not in ('admin','manager','cashier') then raise exception 'No tienes permiso para abrir caja.'; end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception 'Fondo inicial inválido.'; end if;
 if exists(select 1 from public.cash_sessions where opened_by=v_uid and status='open') then raise exception 'Ya tienes una caja abierta. Cierra el turno actual antes de abrir otra.'; end if;
 if v_role='cashier' and p_opening_amount>0 then
  lock table public.general_cash_movements in share row exclusive mode;
  select coalesce(sum(case when type='in' then amount else -amount end),0) into v_balance from public.general_cash_movements;
  if p_opening_amount>v_balance then raise exception 'El fondo inicial supera el efectivo disponible en caja general (Q %).',to_char(v_balance,'FM999999990.00'); end if;
  insert into public.general_cash_movements(type,amount,reason,source,created_by) values('out',p_opening_amount,'Fondo inicial entregado a trabajador','worker_float',v_uid);
 end if;
 insert into public.cash_sessions(opened_by,opening_amount,status) values(v_uid,p_opening_amount,'open') returning id into v_id;
 insert into public.audit_logs(user_id,action,entity,entity_id,details) values(v_uid,'open','cash_session',v_id::text,jsonb_build_object('opening_amount',p_opening_amount));
 return jsonb_build_object('session_id',v_id);
end $$;
revoke all on function public.open_cash_session(numeric) from public;
grant execute on function public.open_cash_session(numeric) to authenticated;
