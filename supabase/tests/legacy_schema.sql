-- stand-ins for Supabase's auth schema and roles
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;
-- legacy table as the old app used it (best-guess; eye_discipline NOT NULL)
create table public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  wpm int not null, accuracy int not null, peeks int not null default 0,
  eye_discipline int not null, duration_seconds int not null,
  created_at timestamptz not null default now()
);
insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
insert into public.sessions (user_id,wpm,accuracy,peeks,eye_discipline,duration_seconds) values
 ('11111111-1111-1111-1111-111111111111',50,96,2,100,60),('11111111-1111-1111-1111-111111111111',55,97,0,100,60);
grant usage on schema public, auth to authenticated;
