-- Scheduling- und Planungs-Felder für Creative Renders.
--
-- Pro Render speichern wir:
--   - scheduled_at: wann der Post raus soll
--   - post_status: Workflow Draft → Review → Approved → Scheduled → Live → Paused/Archived
--   - target_platform: meta_feed / meta_reels / instagram_story / tiktok / linkedin / youtube_shorts
--   - meta_post_id, meta_account_id: für Phase 3 (Direkt-Publish via Meta API)
--   - notes: Freitext für Memo/Briefing
--
-- Granularität: pro RENDER, nicht pro Creative — denn jede Format-Variante
-- (Static/Reel/Animated) wird einzeln gepostet.

alter table public.creative_renders
  add column if not exists scheduled_at    timestamptz,
  add column if not exists post_status     text not null default 'draft'
    check (post_status in ('draft','review','approved','scheduled','live','paused','archived')),
  add column if not exists target_platform text,
  add column if not exists meta_post_id    text,
  add column if not exists meta_account_id text,
  add column if not exists notes           text;

create index if not exists creative_renders_scheduled_at_idx
  on public.creative_renders (scheduled_at);
create index if not exists creative_renders_post_status_idx
  on public.creative_renders (post_status);
create index if not exists creative_renders_creative_status_idx
  on public.creative_renders (creative_id, post_status);

-- Komfort: Projekt-Felder erweitern für künftige Meta-OAuth-Integration.
-- meta_account_id auf Projekt-Ebene macht den Default beim Schedulen leichter.
alter table public.projects
  add column if not exists meta_account_id text,
  add column if not exists default_platform text;
