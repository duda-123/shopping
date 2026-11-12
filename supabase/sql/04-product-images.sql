alter table public.market_products add column image_url text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('market-product-images','market-product-images',true,5242880,array['image/jpeg','image/png','image/webp']);
-- Product photos are public. Writes go through the admin-only market-api action;
-- no direct anon/authenticated Storage write policies are added.
