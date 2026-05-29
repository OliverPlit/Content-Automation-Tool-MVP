-- Pool-Templates pro Kind: speichere welcher konkrete Slot (z. B. "reel_bold")
-- für den Render verwendet wurde, plus die echte Creatomate-UUID als
-- Audit-Trail. Beides nullable für Backwards-Compat mit alten Rows, die nur
-- template_kind hatten (Default-Slot).

alter table public.creative_renders
  add column if not exists template_slot text,
  add column if not exists creatomate_template_id text;

create index if not exists creative_renders_template_slot_idx
  on public.creative_renders (template_slot);
