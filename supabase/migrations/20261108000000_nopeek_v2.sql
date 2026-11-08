-- NoPeek v2: additive, non-destructive migration.
--
--  * Adds new nullable columns to public.sessions (existing rows are untouched).
--  * Relaxes sessions.eye_discipline to NULLABLE so sessions without reliable eye
--    tracking can be stored honestly instead of as a fabricated value.
--  * Creates public.user_profiles (keyboard setup).
--  * Ensures row-level security so users can only read/write their own rows.
--
-- Safe to run more than once. No DROP, no data rewrite.

begin;

-- 1. sessions: new columns -----------------------------------------------------
alter table public.sessions add column if not exists client_id uuid;
alter table public.sessions add column if not exists mode text;
alter table public.sessions add column if not exists lesson_id text;
alter table public.sessions add column if not exists practice_kind text;
alter table public.sessions add column if not exists passed boolean;
alter table public.sessions add column if not exists layout text;
alter table public.sessions add column if not exists tracking_status text;
alter table public.sessions add column if not exists result jsonb;
alter table public.sessions add column if not exists tracking jsonb;
alter table public.sessions add column if not exists analysis jsonb;

-- Old rows defaulted eye_discipline to 100 when no eye data existed, so the column
-- must be allowed to be null for new, honest records.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
      and column_name = 'eye_discipline' and is_nullable = 'NO'
  ) then
    alter table public.sessions alter column eye_discipline drop not null;
  end if;
end $$;

-- client_id lets the app de-duplicate local + cloud copies of the same session.
create unique index if not exists sessions_user_client_id_key
  on public.sessions (user_id, client_id) where client_id is not null;
create index if not exists sessions_user_created_idx
  on public.sessions (user_id, created_at);

-- 2. user_profiles ---------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  keyboard jsonb,
  settings jsonb,
  updated_at timestamptz not null default now()
);

-- 3. row-level security -----------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sessions' and policyname='nopeek_sessions_select_own') then
    create policy nopeek_sessions_select_own on public.sessions for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sessions' and policyname='nopeek_sessions_insert_own') then
    create policy nopeek_sessions_insert_own on public.sessions for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sessions' and policyname='nopeek_sessions_delete_own') then
    create policy nopeek_sessions_delete_own on public.sessions for delete using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_profiles' and policyname='nopeek_profiles_all_own') then
    create policy nopeek_profiles_all_own on public.user_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

commit;
