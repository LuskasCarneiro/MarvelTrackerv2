-- Enough of Supabase to test our own policies against a bare Postgres.
--
-- Why not `supabase start`: that pulls the whole stack (GoTrue, PostgREST, Studio, Kong)
-- to test four policies that are plain Postgres. This needs one postgres image, which
-- GitHub Actions provides as a service container for free.
--
-- Why not test against the real project: creating two confirmed users there needs either a
-- service-role key, which this project deliberately does not have, or two real mailboxes.
-- And a privacy test that writes to the production database to prove privacy is a poor
-- trade. The migration applied here is the same file that CI applies to production.
--
-- The risk this file carries is that it drifts from real Supabase and the test starts
-- passing against a fiction. So each piece below mirrors something specific and is
-- commented with what it mirrors.

-- Supabase's two runtime roles. PostgREST switches into one of these per request based on
-- the JWT; nothing ever connects as the table owner.
--
-- Created conditionally because roles are cluster-wide, not per-database: a plain
-- `create role` fails the second time this harness runs against the same Postgres, which
-- is every local run after the first.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;

-- Only the column the migration's foreign key needs. The real table has ~30 more, none of
-- which any policy here reads.
create table auth.users (id uuid primary key);

-- This is Supabase's actual definition of auth.uid(), not an approximation: it reads the
-- `sub` claim out of the JWT that PostgREST puts into the `request.jwt.claims` setting.
-- If this drifts, the test is worthless, so it is copied rather than invented.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Supabase grants every new table in `public` to anon and authenticated by default. Without
-- this, the migration's `revoke all ... from anon` would be revoking a privilege that was
-- never granted, and the test would prove nothing about the real database.
alter default privileges in schema public grant all on tables to anon, authenticated;
