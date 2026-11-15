alter table public.products
  add column if not exists image_urls text[] not null default '{}'::text[];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 4194304, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists product_images_staff_insert on storage.objects;
create policy product_images_staff_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists product_images_staff_update on storage.objects;
create policy product_images_staff_update
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists product_images_staff_delete on storage.objects;
create policy product_images_staff_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(name))[1]
  )
);
