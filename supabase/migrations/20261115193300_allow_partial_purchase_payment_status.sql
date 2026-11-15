alter table public.purchases drop constraint if exists purchases_payment_status_check;
alter table public.purchases drop constraint if exists purchases_payment_status_valid;
alter table public.purchases add constraint purchases_payment_status_check check(payment_status in ('pending','partial','paid'));
