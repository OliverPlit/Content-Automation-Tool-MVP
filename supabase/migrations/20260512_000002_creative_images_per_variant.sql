-- Per-variant image storage.
-- Each row = one generated image bound to (creative_id, variant_index).
-- UNIQUE constraint allows upsert when the user re-generates the same variant.

create table if not exists public.creative_images (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  creative_id   uuid not null references public.creatives(id) on delete cascade,
  variant_index smallint not null check (variant_index between 0 and 4),
  image_url     text not null,
  image_prompt  text,
  provider      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (creative_id, variant_index)
);

create index if not exists creative_images_creative_id_idx
  on public.creative_images (creative_id);
create index if not exists creative_images_user_id_idx
  on public.creative_images (user_id);

drop trigger if exists creative_images_set_updated_at on public.creative_images;
create trigger creative_images_set_updated_at
  before update on public.creative_images
  for each row execute function public.set_updated_at();

alter table public.creative_images enable row level security;

drop policy if exists "creative_images: owner can select" on public.creative_images;
create policy "creative_images: owner can select"
  on public.creative_images for select
  using (auth.uid() = user_id);

drop policy if exists "creative_images: owner can insert" on public.creative_images;
create policy "creative_images: owner can insert"
  on public.creative_images for insert
  with check (auth.uid() = user_id);

drop policy if exists "creative_images: owner can update" on public.creative_images;
create policy "creative_images: owner can update"
  on public.creative_images for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "creative_images: owner can delete" on public.creative_images;
create policy "creative_images: owner can delete"
  on public.creative_images for delete
  using (auth.uid() = user_id);
