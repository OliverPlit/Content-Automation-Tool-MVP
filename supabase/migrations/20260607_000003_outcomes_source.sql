-- Self-Learning · Phase B — Quellen-Trennung Meta vs. Google.
--
-- creative_outcomes und creative_outcome_history bekommen eine `source`-Spalte,
-- damit Outcomes aus Meta-Ads und Google-Ads parallel gespeichert werden können
-- (gleicher ad_name kann auf beiden Plattformen existieren). Bestandsdaten
-- bleiben 'meta' (= bisheriges Verhalten). Eindeutigkeit erweitert um source.
--
-- Zusätzliche Spalten:
--   - ad_group_name        — Google-Ads-Anzeigengruppe (Meta lässt dies leer)
--   - effectiveness_rating — Google bewertet jede RSA ("Sehr gut" etc.)
--
-- Rollback:
--   alter table public.creative_outcomes drop column source;
--   alter table public.creative_outcomes drop column ad_group_name;
--   alter table public.creative_outcomes drop column effectiveness_rating;
--   alter table public.creative_outcome_history drop column source;
--   alter table public.creative_outcome_history drop column ad_group_name;
--   alter table public.creative_outcome_history drop column effectiveness_rating;

-- ---------------------------------------------------------------------------
-- creative_outcomes
-- ---------------------------------------------------------------------------
alter table public.creative_outcomes
  add column if not exists source text not null default 'meta'
    check (source in ('meta','google_ads'));

alter table public.creative_outcomes
  add column if not exists ad_group_name text;

alter table public.creative_outcomes
  add column if not exists effectiveness_rating text;

-- Unique-Constraint um `source` erweitern, damit dieselbe Ad auf Meta + Google
-- parallel landen darf. Alten Constraint zuerst entfernen (Name wurde von
-- Postgres aus `unique (user_id, ad_name)` automatisch generiert).
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.creative_outcomes'::regclass
    and contype = 'u'
    and array_length(conkey, 1) = 2
    and exists (
      select 1 from unnest(conkey) k
      join pg_attribute a on a.attrelid = conrelid and a.attnum = k
      where a.attname = 'ad_name'
    )
  limit 1;
  if cname is not null then
    execute format('alter table public.creative_outcomes drop constraint %I', cname);
  end if;
end$$;

alter table public.creative_outcomes
  add constraint creative_outcomes_user_ad_source_key
  unique (user_id, ad_name, source);

create index if not exists creative_outcomes_source_idx
  on public.creative_outcomes (user_id, source);

-- ---------------------------------------------------------------------------
-- creative_outcome_history
-- ---------------------------------------------------------------------------
alter table public.creative_outcome_history
  add column if not exists source text not null default 'meta'
    check (source in ('meta','google_ads'));

alter table public.creative_outcome_history
  add column if not exists ad_group_name text;

alter table public.creative_outcome_history
  add column if not exists effectiveness_rating text;

-- Alten Unique-Constraint (user_id, ad_name, source_import_id) erweitern um
-- source — sonst kollidieren Meta- und Google-Snapshots desselben Imports nicht,
-- aber zukünftige cross-source-Konflikte werden sauber getrennt.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.creative_outcome_history'::regclass
    and contype = 'u'
  limit 1;
  if cname is not null then
    execute format(
      'alter table public.creative_outcome_history drop constraint %I',
      cname
    );
  end if;
end$$;

alter table public.creative_outcome_history
  add constraint creative_outcome_history_user_ad_source_import_key
  unique (user_id, ad_name, source, source_import_id);

create index if not exists creative_outcome_history_source_idx
  on public.creative_outcome_history (user_id, source);
