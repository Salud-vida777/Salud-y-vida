
-- Registrar en caja general todas las entradas de efectivo del administrador,
-- incluyendo ventas anteriores a la creación del libro de caja.
create or replace function public.mirror_admin_cash_movement_to_general()
returns trigger language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare v_role text;
begin
  select pr.role into v_role from public.profiles pr
  where pr.id=new.created_by and pr.active=true;
  if v_role in ('admin','manager') then
    insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
    values(new.type,new.amount,new.reason,'admin_cash_movement',new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Backfill de los movimientos administrativos existentes. Cada movimiento
-- queda identificado por su propio ID para evitar duplicados.
insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
select cm.type,cm.amount,cm.reason,'admin_cash_movement',cm.id,cm.created_by
from public.cash_movements cm
join public.profiles pr on pr.id=cm.created_by and pr.active=true
where pr.role in ('admin','manager')
and not exists (
  select 1 from public.general_cash_movements g
  where g.source='admin_cash_movement' and g.reference_id=cm.id
);

create or replace function public.get_pending_worker_deliveries()
returns table(session_id uuid,worker_name text,closed_at timestamptz,closing_amount numeric,delivered_amount numeric,remaining_amount numeric)
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_role text;
begin
  select pr.role into v_role from public.profiles pr where pr.id=auth.uid() and pr.active=true;
  if auth.uid() is null or coalesce(v_role,'') not in ('admin','manager') then
    raise exception 'Solo administración puede consultar entregas.';
  end if;
  return query
  select cs.id,coalesce(nullif(pr.full_name,''),'Trabajador'),cs.closed_at,
    coalesce(cs.closing_amount,0),
    coalesce(sum(g.amount) filter (where g.type='in'),0)-coalesce(sum(g.amount) filter (where g.type='out'),0),
    greatest(coalesce(cs.closing_amount,0) -
      (coalesce(sum(g.amount) filter (where g.type='in'),0)-coalesce(sum(g.amount) filter (where g.type='out'),0)),0)
  from public.cash_sessions cs
  join public.profiles pr on pr.id=cs.opened_by
  left join public.general_cash_movements g on g.source='worker_delivery' and g.reference_id=cs.id
  where cs.status='closed' and pr.role='cashier'
  group by cs.id,pr.full_name,cs.closed_at,cs.closing_amount
  having greatest(coalesce(cs.closing_amount,0) -
      (coalesce(sum(g.amount) filter (where g.type='in'),0)-coalesce(sum(g.amount) filter (where g.type='out'),0)),0)>0
  order by cs.closed_at desc;
end $$;

create or replace function public.receive_worker_cash_delivery(p_session_id uuid,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_role text;v_session public.cash_sessions%rowtype;v_delivered numeric;v_id uuid;
begin
  select pr.role into v_role from public.profiles pr where pr.id=auth.uid() and pr.active=true;
  if auth.uid() is null or coalesce(v_role,'') not in ('admin','manager') then
    raise exception 'Solo administración puede recibir entregas.';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'Monto de entrega inválido.'; end if;
  select * into v_session from public.cash_sessions where id=p_session_id and status='closed' for update;
  if not found or not exists(select 1 from public.profiles pr where pr.id=v_session.opened_by and pr.role='cashier') then
    raise exception 'No se encontró un turno cerrado de trabajador.';
  end if;
  perform 1 from public.general_cash_movements where source='worker_delivery' and reference_id=p_session_id for update;
  select coalesce(sum(case when type='in' then amount else -amount end),0)
    into v_delivered from public.general_cash_movements where source='worker_delivery' and reference_id=p_session_id;
  if v_delivered+p_amount>coalesce(v_session.closing_amount,0) then
    raise exception 'La entrega supera el efectivo contado al cerrar el turno (Q %).',
      to_char(coalesce(v_session.closing_amount,0)-v_delivered,'FM999999990.00');
  end if;
  insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
  values('in',p_amount,'Entrega de efectivo · turno de trabajador','worker_delivery',p_session_id,auth.uid())
  returning id into v_id;
  insert into public.audit_logs(user_id,action,entity,entity_id,details)
  values(auth.uid(),'worker_cash_delivery','general_cash',v_id::text,
    jsonb_build_object('session_id',p_session_id,'amount',p_amount));
  return jsonb_build_object('success',true,'movement_id',v_id);
end $$;

revoke all on function public.get_pending_worker_deliveries() from public;
revoke all on function public.receive_worker_cash_delivery(uuid,numeric) from public;
grant execute on function public.get_pending_worker_deliveries() to authenticated;
grant execute on function public.receive_worker_cash_delivery(uuid,numeric) to authenticated;
