-- Self-Learning-System · Phase 0 (Datenfundament) + Phase 1 (Outcomes).
--
-- Zwei Tabellen:
--   creative_features  — strukturierte Achsen-Features je gespeicherter Variante
--                        (hook, framework, lever, image_style, awareness,
--                        platform, product, audience_segment, audience_text,
--                        headline). Voraussetzung, damit Lernen pro Feature
--                        überhaupt möglich ist.
--   creative_outcomes  — echte Performance (CTR/Impressions/…) je gematchtem
--                        Render/Ad, befüllt aus dem ads_performance-Import
--                        (Matching über die gespeicherte Headline).
--
-- Rollback (falls nötig):
--   drop table if exists public.creative_outcomes;
--   drop table if exists public.creative_features;

-- ---------------------------------------------------------------------------
-- creative_features
-- ---------------------------------------------------------------------------
create table if not exists public.creative_features (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  creative_id      uuid not null references public.creatives(id) on delete cascade,
  variant_index    smallint not null,
  hook             text,
  framework        text,
  lever            text,
  image_style      text,
  awareness        smallint,
  platform         text,
  product          text,
  -- audience_segment = strukturiertes Persona/Avatar; audience_text = Freitext.
  audience_segment text,
  audience_text    text,
  -- Headline denormalisiert → Phase-1-Matching ohne JSON-Join.
  headline         text,
  created_at       timestamptz not null default now(),
  unique (creative_id, variant_index)
);

create index if not exists creative_features_user_id_idx
  on public.creative_features (user_id);
create index if not exists creative_features_creative_id_idx
  on public.creative_features (creative_id);
create index if not exists creative_features_user_hook_idx
  on public.creative_features (user_id, hook);
create index if not exists creative_features_headline_idx
  on public.creative_features (lower(headline));

alter table public.creative_features enable row level security;

drop policy if exists "creative_features: owner can select" on public.creative_features;
create policy "creative_features: owner can select"
  on public.creative_features for select
  using (auth.uid() = user_id);

drop policy if exists "creative_features: owner can insert" on public.creative_features;
create policy "creative_features: owner can insert"
  on public.creative_features for insert
  with check (auth.uid() = user_id);

drop policy if exists "creative_features: owner can update" on public.creative_features;
create policy "creative_features: owner can update"
  on public.creative_features for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "creative_features: owner can delete" on public.creative_features;
create policy "creative_features: owner can delete"
  on public.creative_features for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- creative_outcomes
-- ---------------------------------------------------------------------------
create table if not exists public.creative_outcomes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  render_id        uuid references public.creative_renders(id) on delete cascade,
  creative_id      uuid references public.creatives(id) on delete set null,
  variant_index    smallint,
  -- Matching-Key aus dem ads_performance-Import (Anzeigenname).
  ad_name          text,
  impressions      integer,
  clicks           integer,
  ctr              numeric,   -- in Prozent (wie insights.ts liefert)
  spend            numeric,
  conversions      integer,
  cpa              numeric,
  source_import_id uuid references public.meta_imports(id) on delete set null,
  fetched_at       timestamptz,
  created_at       timestamptz not null default now(),
  -- Re-Import desselben Ads aktualisiert statt dupliziert.
  unique (user_id, ad_name)
);

create index if not exists creative_outcomes_user_id_idx
  on public.creative_outcomes (user_id);
create index if not exists creative_outcomes_render_id_idx
  on public.creative_outcomes (render_id);
create index if not exists creative_outcomes_creative_id_idx
  on public.creative_outcomes (creative_id);

alter table public.creative_outcomes enable row level security;

drop policy if exists "creative_outcomes: owner can select" on public.creative_outcomes;
create policy "creative_outcomes: owner can select"
  on public.creative_outcomes for select
  using (auth.uid() = user_id);

drop policy if exists "creative_outcomes: owner can insert" on public.creative_outcomes;
create policy "creative_outcomes: owner can insert"
  on public.creative_outcomes for insert
  with check (auth.uid() = user_id);

drop policy if exists "creative_outcomes: owner can update" on public.creative_outcomes;
create policy "creative_outcomes: owner can update"
  on public.creative_outcomes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "creative_outcomes: owner can delete" on public.creative_outcomes;
create policy "creative_outcomes: owner can delete"
  on public.creative_outcomes for delete
  using (auth.uid() = user_id);
