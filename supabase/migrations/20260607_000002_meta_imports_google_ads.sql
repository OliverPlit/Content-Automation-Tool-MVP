-- Self-Learning · Phase A — Google-Ads als neuen Import-Typ zulassen.
-- Erweitert den CHECK-Constraint von meta_imports.kind um 'google_ads'.
--
-- Rollback:
--   alter table public.meta_imports drop constraint meta_imports_kind_check;
--   alter table public.meta_imports add constraint meta_imports_kind_check
--     check (kind in ('posts','ads_performance','audience','products'));

alter table public.meta_imports
  drop constraint if exists meta_imports_kind_check;

alter table public.meta_imports
  add constraint meta_imports_kind_check
  check (kind in ('posts','ads_performance','audience','products','google_ads'));
