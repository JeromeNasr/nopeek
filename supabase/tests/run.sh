#!/usr/bin/env bash
# Verifies the TouchType v2 migration against a throwaway local PostgreSQL.
# Usage: PGBIN=/usr/lib/postgresql/16/bin supabase/tests/run.sh
# Needs a postgres binary set; must run as root (uses `su postgres`) or as a normal user.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
D=$(mktemp -d /var/tmp/nopeek-pgtest.XXXXXX); PORT=54329
run() { if [ "$(id -u)" = 0 ]; then chown postgres "$D"; su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
trap 'run "$PGBIN/pg_ctl -D $D/data stop -m immediate >/dev/null 2>&1 || true"; rm -rf "$D"' EXIT
run "$PGBIN/initdb -D $D/data -A trust >/dev/null && $PGBIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log start >/dev/null"
sleep 2
P="psql -h $D -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "create database t"
$P -d t -f "$HERE/legacy_schema.sql"
$P -d t -f "$ROOT/supabase/migrations/20261108000000_nopeek_v2.sql" 2>/dev/null
$P -d t -f "$ROOT/supabase/migrations/20261108000000_nopeek_v2.sql" 2>/dev/null   # idempotent
$P -d t -c "grant all on public.sessions, public.user_profiles to authenticated" -c "grant usage, select on all sequences in schema public to authenticated"
test "$($P -d t -Atc 'select count(*) from sessions')" = 2 && echo "PASS existing rows preserved"
test "$($P -d t -Atc "select is_nullable from information_schema.columns where table_name='sessions' and column_name='eye_discipline'")" = YES && echo "PASS eye_discipline nullable"
$P -d t <<'SQL'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into sessions (user_id, client_id, wpm, accuracy, peeks, eye_discipline, duration_seconds, mode)
  values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 60, 98, 0, null, 30, 'time-30');
do $$ begin
  begin insert into sessions (user_id, client_id, wpm, accuracy, duration_seconds) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001',1,1,1);
        raise exception 'duplicate accepted'; exception when unique_violation then raise notice 'PASS duplicate client_id rejected'; end;
  begin insert into sessions (user_id, wpm, accuracy, duration_seconds) values ('22222222-2222-2222-2222-222222222222',1,1,1);
        raise exception 'cross-user insert accepted'; exception when insufficient_privilege then raise notice 'PASS cross-user insert rejected'; end;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin if (select count(*) from sessions) <> 0 then raise exception 'user 2 can see user 1 rows'; end if; raise notice 'PASS rows isolated per user'; end $$;
SQL
