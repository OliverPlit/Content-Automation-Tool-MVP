-- Central gallery for all images (AI-generated, uploads, scraped, creative outputs).
-- Each creative_image row also gets mirrored here for unified browsing.

create table if not exists public.gallery_assets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  source        text not null check (source in ('ai', 'upload', 'scrape', 'creative')),
  prompt        text,
  format        text check (format in ('1:1', '9:16', '4:5', '16:9')),
  width         int,
  height        int,
  tags          text[] not null default '{}',
  creative_id   uuid references public.creatives(id) on delete set null,
  variant_index smallint,
  provider      text,
  created_at    timestamptz not null default now()
);

create index if not exists gallery_assets_user_id_idx     on public.gallery_assets (user_id);
create index if not exists gallery_assets_created_at_idx  on public.gallery_assets (created_at desc);
create index if not exists gallery_assets_source_idx      on public.gallery_assets (source);
create index if not exists gallery_assets_creative_id_idx on public.gallery_assets (creative_id);

alter table public.gallery_assets enable row level security;

drop policy if exists "gallery_assets: owner can select" on public.gallery_assets;
create policy "gallery_assets: owner can select"
  on public.gallery_assets for select
  using (auth.uid() = user_id);

drop policy if exists "gallery_assets: owner can insert" on public.gallery_assets;
create policy "gallery_assets: owner can insert"
  on public.gallery_assets for insert
  with check (auth.uid() = user_id);

drop policy if exists "gallery_assets: owner can update" on public.gallery_assets;
create policy "gallery_assets: owner can update"
  on public.gallery_assets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "gallery_assets: owner can delete" on public.gallery_assets;
create policy "gallery_assets: owner can delete"
  on public.gallery_assets for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Backfill: existing creative_images rows -> gallery_assets
-- ---------------------------------------------------------------------------
insert into public.gallery_assets (user_id, url, source, prompt, format, creative_id, variant_index, provider, created_at)
select user_id, image_url, 'creative', image_prompt, '1:1', creative_id, variant_index, provider, created_at
from public.creative_images
on conflict do nothing;
