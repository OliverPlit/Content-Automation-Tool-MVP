-- Stufe-1-Lernschleife: User-Präferenz pro Variante.
-- Jeder 👍/👎 wird mit den Achsen der Variante gespeichert, sodass der
-- Variant-Plan-Generator beim nächsten Lauf die geliketen Hooks/Frameworks
-- bevorzugt und die unbeliebten deboosted.
--
-- creative_id ist FK auf creatives — wenn ein Creative noch nicht
-- gespeichert ist (Generate-Vorschau), bleibt creative_id NULL und wir
-- speichern nur die Achsen + Rating.

create table if not exists public.creative_feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  creative_id   uuid references public.creatives(id) on delete set null,
  variant_index smallint,
  hook          text,
  framework     text,
  lever         text,
  persona       text,
  platform      text,
  rating        smallint not null check (rating in (-1, 1)),
  created_at    timestamptz not null default now()
);

create index if not exists creative_feedback_user_id_idx
  on public.creative_feedback (user_id);
create index if not exists creative_feedback_user_hook_idx
  on public.creative_feedback (user_id, hook);
create index if not exists creative_feedback_creative_id_idx
  on public.creative_feedback (creative_id);

alter table public.creative_feedback enable row level security;

drop policy if exists "creative_feedback: owner can select" on public.creative_feedback;
create policy "creative_feedback: owner can select"
  on public.creative_feedback for select
  using (auth.uid() = user_id);

drop policy if exists "creative_feedback: owner can insert" on public.creative_feedback;
create policy "creative_feedback: owner can insert"
  on public.creative_feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "creative_feedback: owner can update" on public.creative_feedback;
create policy "creative_feedback: owner can update"
  on public.creative_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "creative_feedback: owner can delete" on public.creative_feedback;
create policy "creative_feedback: owner can delete"
  on public.creative_feedback for delete
  using (auth.uid() = user_id);
