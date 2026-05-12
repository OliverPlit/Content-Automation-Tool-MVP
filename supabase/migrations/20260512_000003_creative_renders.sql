-- Creatomate render jobs per (creative, variant, template).
-- A render row tracks one job that was submitted to Creatomate's API.

create table if not exists public.creative_renders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  creative_id     uuid not null references public.creatives(id) on delete cascade,
  variant_index   smallint not null check (variant_index between 0 and 4),
  template_kind   text not null check (template_kind in ('staticSquare','animatedSquare','reelVertical')),
  creatomate_id   text,
  status          text not null default 'pending'
                  check (status in ('pending','processing','succeeded','failed')),
  output_url      text,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists creative_renders_creative_id_idx
  on public.creative_renders (creative_id);
create index if not exists creative_renders_user_id_idx
  on public.creative_renders (user_id);
create index if not exists creative_renders_status_idx
  on public.creative_renders (status);

drop trigger if exists creative_renders_set_updated_at on public.creative_renders;
create trigger creative_renders_set_updated_at
  before update on public.creative_renders
  for each row execute function public.set_updated_at();

alter table public.creative_renders enable row level security;

drop policy if exists "creative_renders: owner can select" on public.creative_renders;
create policy "creative_renders: owner can select"
  on public.creative_renders for select
  using (auth.uid() = user_id);

drop policy if exists "creative_renders: owner can insert" on public.creative_renders;
create policy "creative_renders: owner can insert"
  on public.creative_renders for insert
  with check (auth.uid() = user_id);

drop policy if exists "creative_renders: owner can update" on public.creative_renders;
create policy "creative_renders: owner can update"
  on public.creative_renders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "creative_renders: owner can delete" on public.creative_renders;
create policy "creative_renders: owner can delete"
  on public.creative_renders for delete
  using (auth.uid() = user_id);
