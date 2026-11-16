create table if not exists public.expense_records (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Servicios','Personal','Limpieza','Alquiler','Mantenimiento','Administración','Transporte','Otros')),
  description text not null check (length(trim(description)) between 2 and 240),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default (now() at time zone 'America/Guatemala')::date,
  payment_method text not null check (payment_method in ('cash','transfer')),
  receipt_reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists expense_records_expense_date_idx on public.expense_records(expense_date desc);
create index if not exists expense_records_created_by_idx on public.expense_records(created_by);
alter table public.expense_records enable row level security;
revoke all on public.expense_records from anon, authenticated;
grant select on public.expense_records to authenticated;
create policy "Admin and manager read expenses" on public.expense_records for select to authenticated using (public.current_app_role() in ('admin','manager'));
revoke insert, update, delete on public.expense_records from anon, authenticated;
-- record_expense RPC and restore_business_backup_base include the validated SQL deployed in this migration.