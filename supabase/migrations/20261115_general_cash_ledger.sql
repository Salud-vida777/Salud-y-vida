alter table public.purchases
 add column if not exists payment_method text not null default 'cash' check(payment_method in ('cash','transfer','credit')),
 add column if not exists payment_status text not null default 'paid' check(payment_status in ('paid','pending'));
create table if not exists public.general_cash_movements(
 id uuid primary key default gen_random_uuid(),
 type text not null check(type in ('in','out')),
 amount numeric(12,2) not null check(amount>0),
 reason text not null, source text not null default 'manual', reference_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.general_cash_movements enable row level security;
revoke all on public.general_cash_movements from anon,authenticated;
create or replace function public.get_general_cash_summary()
returns table(balance numeric,movement_id uuid,movement_type text,amount numeric,reason text,source text,created_at timestamptz,created_by uuid)
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_role text;
begin
 select pr.role into v_role from public.profiles pr where pr.id=auth.uid() and pr.active=true;
 if auth.uid() is null or coalesce(v_role,'') not in ('admin','manager') then raise exception 'Solo administración puede consultar la caja general.'; end if;
 return query select coalesce((select sum(case when g.type='in' then g.amount else -g.amount end) from public.general_cash_movements g),0)::numeric,
 g.id,g.type,g.amount,g.reason,g.source,g.created_at,g.created_by from public.general_cash_movements g order by g.created_at desc limit 200;
 if not found then return query select coalesce((select sum(case when g.type='in' then g.amount else -g.amount end) from public.general_cash_movements g),0)::numeric,
 null::uuid,null::text,null::numeric,null::text,null::text,null::timestamptz,null::uuid; end if;
end $$;
create or replace function public.record_general_cash_movement(p_type text,p_amount numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_role text;v_id uuid;v_balance numeric;
begin
 select pr.role into v_role from public.profiles pr where pr.id=auth.uid() and pr.active=true;
 if auth.uid() is null or coalesce(v_role,'') not in ('admin','manager') then raise exception 'Solo administración puede modificar la caja general.'; end if;
 if p_type not in ('in','out') or p_amount is null or p_amount<=0 or length(trim(coalesce(p_reason,'')))<2 then raise exception 'Datos del movimiento inválidos.'; end if;
 if p_type='out' then
  lock table public.general_cash_movements in share row exclusive mode;
  select coalesce(sum(case when type='in' then amount else -amount end),0) into v_balance from public.general_cash_movements;
  if p_amount>v_balance then raise exception 'El egreso supera el efectivo disponible en caja general.'; end if;
 end if;
 insert into public.general_cash_movements(type,amount,reason,source,created_by) values(p_type,p_amount,trim(p_reason),'manual',auth.uid()) returning id into v_id;
 insert into public.audit_logs(user_id,action,entity,entity_id,details) values(auth.uid(),'general_cash_movement','general_cash',v_id::text,jsonb_build_object('type',p_type,'amount',p_amount,'reason',p_reason));
 return jsonb_build_object('success',true,'movement_id',v_id);
end $$;
create or replace function public.mirror_admin_cash_movement_to_general()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_role text;
begin
 select pr.role into v_role from public.profiles pr where pr.id=new.created_by and pr.active=true;
 if v_role in ('admin','manager') then
  insert into public.general_cash_movements(type,amount,reason,source,reference_id,created_by)
  values(new.type,new.amount,new.reason,'admin_cash_session',new.session_id,new.created_by);
 end if;
 return new;
end $$;
drop trigger if exists trg_mirror_admin_cash_to_general on public.cash_movements;
create trigger trg_mirror_admin_cash_to_general after insert on public.cash_movements for each row execute function public.mirror_admin_cash_movement_to_general();
revoke all on function public.get_general_cash_summary() from public;
revoke all on function public.record_general_cash_movement(text,numeric,text) from public;
grant execute on function public.get_general_cash_summary() to authenticated;
grant execute on function public.record_general_cash_movement(text,numeric,text) to authenticated;
