-- Core tables for Creative-Tool: projects, templates, creatives
-- All tables are user-scoped via auth.uid() and protected by Row Level Security.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: trigger function to keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists "projects: owner can select" on public.projects;
create policy "projects: owner can select"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects: owner can insert" on public.projects;
create policy "projects: owner can insert"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects: owner can update" on public.projects;
create policy "projects: owner can update"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "projects: owner can delete" on public.projects;
create policy "projects: owner can delete"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- templates
-- user_id NULL = system/global template visible to all authenticated users.
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  prompt_template text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists templates_user_id_idx on public.templates (user_id);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.templates enable row level security;

drop policy if exists "templates: owner or global can select" on public.templates;
create policy "templates: owner or global can select"
  on public.templates for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "templates: owner can insert" on public.templates;
create policy "templates: owner can insert"
  on public.templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "templates: owner can update" on public.templates;
create policy "templates: owner can update"
  on public.templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "templates: owner can delete" on public.templates;
create policy "templates: owner can delete"
  on public.templates for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- creatives
-- ---------------------------------------------------------------------------
create table if not exists public.creatives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  prompt      text not null,
  output      text,
  status      text not null default 'pending'
              check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists creatives_user_id_idx     on public.creatives (user_id);
create index if not exists creatives_project_id_idx  on public.creatives (project_id);
create index if not exists creatives_template_id_idx on public.creatives (template_id);
create index if not exists creatives_created_at_idx  on public.creatives (created_at desc);

drop trigger if exists creatives_set_updated_at on public.creatives;
create trigger creatives_set_updated_at
  before update on public.creatives
  for each row execute function public.set_updated_at();

alter table public.creatives enable row level security;

drop policy if exists "creatives: owner can select" on public.creatives;
create policy "creatives: owner can select"
  on public.creatives for select
  using (auth.uid() = user_id);

drop policy if exists "creatives: owner can insert" on public.creatives;
create policy "creatives: owner can insert"
  on public.creatives for insert
  with check (auth.uid() = user_id);

drop policy if exists "creatives: owner can update" on public.creatives;
create policy "creatives: owner can update"
  on public.creatives for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "creatives: owner can delete" on public.creatives;
create policy "creatives: owner can delete"
  on public.creatives for delete
  using (auth.uid() = user_id);
