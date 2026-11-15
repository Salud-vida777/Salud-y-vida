create unique index if not exists general_cash_movements_source_reference_unique
on public.general_cash_movements(source,reference_id)
where reference_id is not null and source in ('admin_cash_movement','purchase','purchase_payment');
