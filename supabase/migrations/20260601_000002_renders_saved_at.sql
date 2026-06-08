-- ---------------------------------------------------------------------------
-- creative_renders.saved_at
-- ---------------------------------------------------------------------------
-- Trennt das automatische DB-Persistieren eines Renders (passiert sofort
-- nach Klick „Render starten", damit das Polling laufen kann) vom expliziten
-- „in Drafts speichern" (User-Klick).
--
--   saved_at = NULL  → Render existiert in DB, aber NICHT im Posts-Kanban
--                       (User hat sich noch nicht entschieden ob er es will)
--   saved_at = ts    → User hat „In Drafts speichern" geklickt → erscheint
--                       in Posts-Kanban-Drafts-Spalte, kann weiter durch
--                       Review/Approved/Scheduled/Live wandern
-- ---------------------------------------------------------------------------

alter table public.creative_renders
  add column if not exists saved_at timestamptz;

create index if not exists creative_renders_saved_at_idx
  on public.creative_renders (saved_at);

-- Bestehende Renders rückwirkend als „gespeichert" markieren — sonst
-- verschwinden alle alten Drafts plötzlich aus dem Kanban.
update public.creative_renders
   set saved_at = coalesce(saved_at, created_at)
 where saved_at is null;
