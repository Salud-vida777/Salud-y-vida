alter table public.purchases add column if not exists updated_at timestamptz not null default now();
