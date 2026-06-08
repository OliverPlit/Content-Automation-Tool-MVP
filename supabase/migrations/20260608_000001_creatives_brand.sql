-- Brand-Farben und Logo direkt am Creative speichern, damit Renders
-- die Vorlagen-Farben auch dann übernehmen, wenn das Creative NICHT
-- einem Folder mit Brand-Settings zugeordnet ist.
--
-- Bisheriges Verhalten: render-actions las brand_*_color ausschließlich aus
-- project_folders → ohne Folder kein Brand → Default-Indigo.
--
-- Jetzt: Render-Action liest Creative-Brand zuerst, dann Folder-Brand,
-- dann Default. saveCreative/saveAllVariants schreiben Brand-Werte direkt
-- am Creative — der Folder-Brand-Sync bleibt zusätzlich erhalten.
--
-- Rollback:
--   alter table public.creatives drop column brand_primary_color;
--   alter table public.creatives drop column brand_accent_color;
--   alter table public.creatives drop column brand_background_color;
--   alter table public.creatives drop column brand_text_color;
--   alter table public.creatives drop column brand_logo_url;

alter table public.creatives
  add column if not exists brand_primary_color text,
  add column if not exists brand_accent_color text,
  add column if not exists brand_background_color text,
  add column if not exists brand_text_color text,
  add column if not exists brand_logo_url text;

-- Schema-Cache reloaden, damit PostgREST die neuen Spalten kennt
notify pgrst, 'reload schema';
