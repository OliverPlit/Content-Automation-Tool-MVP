-- Brand-Style pro Kampagnen-Ordner (Folder).
--
-- Die Werte fließen beim Render als Modifications an Creatomate. Damit die
-- Templates sie übernehmen können, müssen die Element-Properties im
-- Creatomate-Template entsprechende Namen haben (Headline.font_family,
-- Primary-Color.fill_color, etc. — Tool sendet ohnehin mehrere Aliases).
--
-- Alle Felder optional — fehlt ein Wert, bleibt der Template-Default aktiv.

alter table public.project_folders
  add column if not exists brand_primary_color    text,
  add column if not exists brand_accent_color     text,
  add column if not exists brand_background_color text,
  add column if not exists brand_text_color       text,
  add column if not exists brand_font_family      text,
  add column if not exists brand_font_weight      text;

-- Hinweis: keine CHECK-Constraints für Farbformat, weil wir auch
-- "rgba(...)" oder "transparent" akzeptieren. UI validiert hex.
