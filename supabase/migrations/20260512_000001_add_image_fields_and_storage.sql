-- Add image columns to creatives + create a public storage bucket for generated images.

-- ---------------------------------------------------------------------------
-- 1. Image columns on creatives
-- ---------------------------------------------------------------------------
alter table public.creatives
  add column if not exists image_url    text,
  add column if not exists image_prompt text;

-- ---------------------------------------------------------------------------
-- 2. Public storage bucket "creative-images"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('creative-images', 'creative-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Storage RLS policies
--    - public read (so <img src="..."> works without signing)
--    - authenticated users can insert/update/delete only files under their
--      own user-id folder, e.g. "<auth.uid()>/<creative-id>.png"
-- ---------------------------------------------------------------------------
drop policy if exists "creative-images: public read" on storage.objects;
create policy "creative-images: public read"
  on storage.objects for select
  using (bucket_id = 'creative-images');

drop policy if exists "creative-images: owner can insert" on storage.objects;
create policy "creative-images: owner can insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creative-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "creative-images: owner can update" on storage.objects;
create policy "creative-images: owner can update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'creative-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "creative-images: owner can delete" on storage.objects;
create policy "creative-images: owner can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'creative-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
