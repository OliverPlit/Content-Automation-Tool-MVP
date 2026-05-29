-- Phase: Kampagnen-Ordner innerhalb von Projekten.
--
-- 1 Projekt → N Folder → M Creatives. Flach, kein Verschachteln (vorerst).
-- folder_id auf creatives ist nullable: ein Creative kann „im Projekt aber
-- nicht in einem Folder" liegen. Wird beim Anlegen meistens gesetzt.

create table if not exists public.project_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null check (length(name) between 1 and 100),
  color       text,
  description text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists project_folders_project_id_idx
  on public.project_folders (project_id);
create index if not exists project_folders_user_id_idx
  on public.project_folders (user_id);

drop trigger if exists project_folders_set_updated_at on public.project_folders;
create trigger project_folders_set_updated_at
  before update on public.project_folders
  for each row execute function public.set_updated_at();

alter table public.project_folders enable row level security;

drop policy if exists "project_folders: owner can select" on public.project_folders;
create policy "project_folders: owner can select"
  on public.project_folders for select
  using (auth.uid() = user_id);

drop policy if exists "project_folders: owner can insert" on public.project_folders;
create policy "project_folders: owner can insert"
  on public.project_folders for insert
  with check (auth.uid() = user_id);

drop policy if exists "project_folders: owner can update" on public.project_folders;
create policy "project_folders: owner can update"
  on public.project_folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "project_folders: owner can delete" on public.project_folders;
create policy "project_folders: owner can delete"
  on public.project_folders for delete
  using (auth.uid() = user_id);

-- creatives bekommt folder_id (nullable). Folder muss zum selben Projekt
-- gehören — das prüft die UI vor dem Set. Beim Folder-Delete bleiben die
-- Creatives als „im Projekt, kein Folder" (set null statt cascade).
alter table public.creatives
  add column if not exists folder_id uuid
    references public.project_folders(id) on delete set null;

create index if not exists creatives_folder_id_idx
  on public.creatives (folder_id);
