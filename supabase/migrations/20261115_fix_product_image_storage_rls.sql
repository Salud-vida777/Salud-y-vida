drop policy if exists product_images_staff_insert on storage.objects;
create policy product_images_staff_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

drop policy if exists product_images_staff_update on storage.objects;
create policy product_images_staff_update
on storage.objects for update
using (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(storage.objects.name))[1]
  )
)
with check (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

drop policy if exists product_images_staff_delete on storage.objects;
create policy product_images_staff_delete
on storage.objects for delete
using (
  bucket_id = 'product-images'
  and public.current_app_role() = any (array['admin','manager','inventory']::text[])
  and exists (
    select 1 from public.products p
    where p.id::text = (storage.foldername(storage.objects.name))[1]
  )
);
