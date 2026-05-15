-- Prompt-Vorlagen speichern jetzt ein komplettes Eingabe-Set als JSONB,
-- damit ein Klick auf "Verwenden" das gesamte Generate-Form vorausfüllen kann.

alter table public.templates
  add column if not exists template_data jsonb;
