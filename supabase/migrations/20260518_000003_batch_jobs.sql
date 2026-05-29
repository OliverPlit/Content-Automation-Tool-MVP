-- Batch pipeline: bulk-generate creatives from CSV / URL-list.
-- A batch_job has many batch_job_items. The worker (cron) picks up
-- pending items and runs the generate pipeline on each.

create table if not exists public.batch_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  template_id  uuid references public.templates(id) on delete set null,
  name         text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  total        int not null default 0,
  completed    int not null default 0,
  failed       int not null default 0,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists batch_jobs_user_id_idx     on public.batch_jobs (user_id);
create index if not exists batch_jobs_created_at_idx  on public.batch_jobs (created_at desc);

alter table public.batch_jobs enable row level security;

drop policy if exists "batch_jobs: owner can select" on public.batch_jobs;
create policy "batch_jobs: owner can select"
  on public.batch_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "batch_jobs: owner can insert" on public.batch_jobs;
create policy "batch_jobs: owner can insert"
  on public.batch_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "batch_jobs: owner can update" on public.batch_jobs;
create policy "batch_jobs: owner can update"
  on public.batch_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "batch_jobs: owner can delete" on public.batch_jobs;
create policy "batch_jobs: owner can delete"
  on public.batch_jobs for delete
  using (auth.uid() = user_id);


create table if not exists public.batch_job_items (
  id              uuid primary key default gen_random_uuid(),
  batch_job_id    uuid not null references public.batch_jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  position        int not null default 0,
  input_data      jsonb not null,
  creative_id     uuid references public.creatives(id) on delete set null,
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'done', 'failed')),
  error_message   text,
  started_at      timestamptz,
  finished_at     timestamptz
);

create index if not exists batch_job_items_job_idx     on public.batch_job_items (batch_job_id);
create index if not exists batch_job_items_status_idx  on public.batch_job_items (status);
create index if not exists batch_job_items_user_id_idx on public.batch_job_items (user_id);

alter table public.batch_job_items enable row level security;

drop policy if exists "batch_job_items: owner can select" on public.batch_job_items;
create policy "batch_job_items: owner can select"
  on public.batch_job_items for select
  using (auth.uid() = user_id);

drop policy if exists "batch_job_items: owner can insert" on public.batch_job_items;
create policy "batch_job_items: owner can insert"
  on public.batch_job_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "batch_job_items: owner can update" on public.batch_job_items;
create policy "batch_job_items: owner can update"
  on public.batch_job_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "batch_job_items: owner can delete" on public.batch_job_items;
create policy "batch_job_items: owner can delete"
  on public.batch_job_items for delete
  using (auth.uid() = user_id);
