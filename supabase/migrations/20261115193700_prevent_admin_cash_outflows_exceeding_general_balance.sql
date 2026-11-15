create or replace function public.mirror_admin_cash_movement_to_general()
returns trigger language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare v_role text;v_balance numeric;
begin
 select pr.role into v_role from public.profiles pr
 where pr.id=new.created_by and pr.active=true;
 if v_role in ('admin','manager') then
  if new.type='out' then
   lock table public.general_cash_movements in share row exclusive mode;
   select coalesce(sum(case when type='in' then amount else -amount end),0)
    into v_balance from public.general_cash_movements;
   if new.amount>v_balance then
    raise exception 'El egreso supera el efectivo disponible en caja general (Q %).',
      to_char(v_balance,'FM999999990.00');
   end if;
  end if;
  insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
  values(new.type,new.amount,new.reason,'admin_cash_movement',new.id,new.created_by)
  on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.mirror_admin_cash_movement_to_general() from public,anon,authenticated;
