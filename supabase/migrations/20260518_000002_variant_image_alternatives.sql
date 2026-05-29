-- Allow multiple images per (creative_id, variant_index):
--  - drop the old UNIQUE constraint
--  - add `alt_index` to distinguish alternatives
--  - add `is_active` so render-actions only picks the chosen one

alter table public.creative_images
  add column if not exists alt_index smallint not null default 0,
  add column if not exists is_active boolean not null default true;

-- Drop the old unique constraint that allowed only one image per variant.
-- The constraint name from the original migration is the default Postgres name.
alter table public.creative_images
  drop constraint if exists creative_images_creative_id_variant_index_key;

-- New uniqueness: one row per (creative_id, variant_index, alt_index).
alter table public.creative_images
  add constraint creative_images_variant_alt_unique
  unique (creative_id, variant_index, alt_index);

-- Make sure only one image per (creative_id, variant_index) is active at a time.
create unique index if not exists creative_images_active_unique
  on public.creative_images (creative_id, variant_index)
  where is_active;
