-- Self-Learning · Phase 5 — Outcome-History (Zeitreihe für Creative-Fatigue).
--
-- creative_outcomes hält den AKTUELLEN Stand je Ad (Upsert). Für die
-- Fatigue-Erkennung ("CTR-Abfall über Zeit") brauchen wir aber den VERLAUF.
-- Diese Tabelle ist append-only: pro Ads-Import ein Snapshot je gematchtem Ad.
--
-- Rollback:
--   drop table if exists public.creative_outcome_history;

create table if not exists public.creative_outcome_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  creative_id      uuid references public.creatives(id) on delete set null,
  variant_index    smallint,
  ad_name          text,
  ctr              numeric,   -- in Prozent
  impressions      integer,
  clicks           integer,
  spend            numeric,
  conversions      integer,
  source_import_id uuid references public.meta_imports(id) on delete set null,
  fetched_at       timestamptz,
  created_at       timestamptz not null default now(),
  -- Pro Import genau ein Snapshot je Ad (idempotent bei Re-Match).
  unique (user_id, ad_name, source_import_id)
);

create index if not exists creative_outcome_history_user_idx
  on public.creative_outcome_history (user_id);
create index if not exists creative_outcome_history_user_ad_idx
  on public.creative_outcome_history (user_id, ad_name, fetched_at);

alter table public.creative_outcome_history enable row level security;

drop policy if exists "outcome_history: owner can select" on public.creative_outcome_history;
create policy "outcome_history: owner can select"
  on public.creative_outcome_history for select
  using (auth.uid() = user_id);

drop policy if exists "outcome_history: owner can insert" on public.creative_outcome_history;
create policy "outcome_history: owner can insert"
  on public.creative_outcome_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "outcome_history: owner can update" on public.creative_outcome_history;
create policy "outcome_history: owner can update"
  on public.creative_outcome_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "outcome_history: owner can delete" on public.creative_outcome_history;
create policy "outcome_history: owner can delete"
  on public.creative_outcome_history for delete
  using (auth.uid() = user_id);
