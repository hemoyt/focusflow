-- FocusFlow schema for Supabase
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Tables mirror the Task and TimerSession types in src/store.ts.
-- Data is scoped per authenticated user via Supabase Auth (auth.uid()).

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  sessions integer not null default 0,
  created_at date not null default current_date,
  project_id uuid,
  due_date date,
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  inserted_at timestamptz not null default now()
);

create table if not exists timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references tasks (id) on delete set null,
  task_text text,
  duration integer not null, -- seconds
  completed boolean not null default false,
  timestamp timestamptz not null default now()
);

-- ── Upgrade from the pre-accounts schema ──
-- FocusFlow 1.0 shipped these tables without a user_id: one shared pile of rows
-- behind a permissive policy. The `create table if not exists` above skips an
-- existing table entirely, so a project from that era reaches this point still
-- missing the column everything below depends on. Add it before it's needed.
alter table tasks
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table timer_sessions
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Rows created before accounts existed belong to nobody and cannot be
-- attributed to one now. They keep a null user_id, which the policies below
-- make invisible and unwritable — no account can read them, and none can claim
-- them. Nothing here deletes them, and you never have to: they are already
-- sealed off. Clearing them out is purely cosmetic, and if you ever want to,
-- it goes in a SEPARATE query AFTER this whole file has run at least once
-- (before that the user_id column does not exist yet and it will fail):
--   delete from tasks where user_id is null;
--   delete from timer_sessions where user_id is null;
--
-- Once no orphans remain the column can carry the same NOT NULL a fresh install
-- gets, so a migrated project converges on the identical shape.
do $$
begin
  if not exists (select 1 from tasks where user_id is null) then
    alter table tasks alter column user_id set not null;
  end if;
  if not exists (select 1 from timer_sessions where user_id is null) then
    alter table timer_sessions alter column user_id set not null;
  end if;
end $$;

create index if not exists tasks_user_id_idx on tasks (user_id);
create index if not exists timer_sessions_user_id_idx on timer_sessions (user_id);

-- Row Level Security: each user can only see and modify their own rows.
alter table tasks enable row level security;
alter table timer_sessions enable row level security;

-- Postgres has no "create policy if not exists", so each policy is dropped
-- first. That makes this whole file safe to run again at any time — re-running
-- it is the fastest way to repair a project whose policies drifted.
drop policy if exists "public access to tasks" on tasks;
drop policy if exists "public access to timer_sessions" on timer_sessions;

drop policy if exists "select own tasks" on tasks;
create policy "select own tasks" on tasks
  for select using (auth.uid() = user_id);

drop policy if exists "insert own tasks" on tasks;
create policy "insert own tasks" on tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own tasks" on tasks;
create policy "update own tasks" on tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own tasks" on tasks;
create policy "delete own tasks" on tasks
  for delete using (auth.uid() = user_id);

drop policy if exists "select own timer_sessions" on timer_sessions;
create policy "select own timer_sessions" on timer_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "insert own timer_sessions" on timer_sessions;
create policy "insert own timer_sessions" on timer_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own timer_sessions" on timer_sessions;
create policy "update own timer_sessions" on timer_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own timer_sessions" on timer_sessions;
create policy "delete own timer_sessions" on timer_sessions
  for delete using (auth.uid() = user_id);

-- Upgrading from the old permissive-access version of this schema needs no
-- extra steps — the migration block above handles it. Just run this file.

-- Final check. A successful run prints one row reading "ready" in every column;
-- anything else means the statements above did not all apply.
select
  case when count(*) filter (
    where table_name = 'tasks' and column_name = 'user_id'
  ) = 1 then 'ready' else 'MISSING user_id' end as tasks_table,
  case when count(*) filter (
    where table_name = 'timer_sessions' and column_name = 'user_id'
  ) = 1 then 'ready' else 'MISSING user_id' end as sessions_table,
  (
    select case when count(*) = 8 then 'ready' else count(*) || ' of 8 present' end
    from pg_policies
    where schemaname = 'public' and tablename in ('tasks', 'timer_sessions')
  ) as security_policies
from information_schema.columns
where table_schema = 'public' and column_name = 'user_id';
