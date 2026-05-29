-- Meta-CSV-Importe (Phase 2: Daten aus Meta Business / Ads Manager).
--
-- Vier Typen:
--   posts            — Top-Performer-Posts mit Caption/Engagement (für Hook-Inspiration)
--   ads_performance  — Ad-CTR/CPM/Spend pro Variante (Stufe-2-Lernschleife)
--   audience         — Demographics / Interessen / Job-Titles
--   products         — Produktkatalog für Bulk-Generate (Meta-Catalog-Format)
--
-- Wir speichern raw_csv (zum Debug) + parsed_json (geparste Rows) +
-- insights (aggregiertes Distillat das beim Generate in den Prompt fließt).

create table if not exists public.meta_imports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('posts','ads_performance','audience','products')),
  filename    text,
  row_count   integer not null default 0,
  raw_csv     text,
  parsed_json jsonb not null default '[]'::jsonb,
  insights    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists meta_imports_user_id_idx
  on public.meta_imports (user_id);
create index if not exists meta_imports_user_kind_idx
  on public.meta_imports (user_id, kind, created_at desc);

alter table public.meta_imports enable row level security;

drop policy if exists "meta_imports: owner can select" on public.meta_imports;
create policy "meta_imports: owner can select"
  on public.meta_imports for select
  using (auth.uid() = user_id);

drop policy if exists "meta_imports: owner can insert" on public.meta_imports;
create policy "meta_imports: owner can insert"
  on public.meta_imports for insert
  with check (auth.uid() = user_id);

drop policy if exists "meta_imports: owner can update" on public.meta_imports;
create policy "meta_imports: owner can update"
  on public.meta_imports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "meta_imports: owner can delete" on public.meta_imports;
create policy "meta_imports: owner can delete"
  on public.meta_imports for delete
  using (auth.uid() = user_id);
