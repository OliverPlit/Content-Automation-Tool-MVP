-- ---------------------------------------------------------------------------
-- creative_renders.template_kind — Constraint auf neue Format-Kinds erweitern
-- ---------------------------------------------------------------------------
-- Hintergrund:
--   Die ursprüngliche Migration (20260512_000003_creative_renders.sql) hat
--   `template_kind` mit einem CHECK auf nur 3 Werte erstellt:
--     staticSquare, animatedSquare, reelVertical
--
--   Seit RF1 (templates.ts) gibt es 5 weitere Format-Kinds:
--     static_1x1, static_4x5, static_16x9, reel_1x1, reel_16x9
--
--   Insert mit einem der neuen Kinds → CHECK-Violation → Render-Action bricht
--   ab BEVOR Creatomate aufgerufen wird.
--
--   Fix: alte CHECK-Constraint droppen, neue mit allen 8 Kinds anlegen.
-- ---------------------------------------------------------------------------

-- Alte Constraint suchen + droppen (Postgres benennt sie meist
-- "creative_renders_template_kind_check" — falls Supabase einen anderen
-- Namen vergeben hat, finden wir sie über information_schema).
do $$
declare
  v_name text;
begin
  select con.conname
    into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'creative_renders'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%template_kind%';
  if v_name is not null then
    execute format(
      'alter table public.creative_renders drop constraint %I',
      v_name
    );
  end if;
end$$;

-- Neue Constraint mit allen 8 Kinds (Stand RF1).
alter table public.creative_renders
  add constraint creative_renders_template_kind_check
  check (template_kind in (
    'staticSquare',
    'animatedSquare',
    'reelVertical',
    'static_1x1',
    'static_4x5',
    'static_16x9',
    'reel_1x1',
    'reel_16x9'
  ));
