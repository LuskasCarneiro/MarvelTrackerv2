-- Private shelves are the product's core promise and they are enforced by RLS alone. This
-- file is the proof, not an illustration: every check raises and fails the run.
--
-- Run against a database that has had harness.sql and then the migrations applied.
-- `npm run test:rls` does that; so does .github/workflows/ci.yml.

\set ON_ERROR_STOP on

-- Two users who both exist and are both entitled to use the app. The question this file
-- answers is only ever "can one of them reach the other's rows".
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- ---------------------------------------------------------------------------
-- Alice puts two titles on her shelf.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

insert into public.entries (slug, watched, rating) values ('iron-man-2008', true, 9);
insert into public.entries (slug, watched) values ('thor-2011', true);

do $$
begin
  -- user_id is never sent by the client; the column default fills it from the JWT.
  if (select count(*) from public.entries
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'FAIL: user_id default did not resolve to auth.uid()';
  end if;
end $$;
commit;

-- ---------------------------------------------------------------------------
-- Bob cannot see, change or remove any of it. This is the whole promise.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';

do $$
declare n int;
begin
  select count(*) into n from public.entries;
  if n <> 0 then
    raise exception 'FAIL: another user''s shelf is readable — saw % rows', n;
  end if;

  -- A blocked UPDATE is not an error, it simply matches no rows. That is exactly why it
  -- needs asserting: a policy gap here would look like a working feature.
  update public.entries set rating = 1;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: updated % of another user''s rows', n;
  end if;

  delete from public.entries;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: deleted % of another user''s rows', n;
  end if;
end $$;

-- Bob cannot write a row onto Alice's shelf either. Without WITH CHECK on INSERT this
-- succeeds and plants rows in someone else's account.
do $$
begin
  insert into public.entries (user_id, slug)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'planted-2099');
  raise exception 'FAIL: wrote a row onto another user''s shelf';
exception
  when insufficient_privilege then null;  -- the RLS violation we want
end $$;
commit;

-- ---------------------------------------------------------------------------
-- Alice cannot push one of her own rows across to Bob. This is the case a USING clause
-- alone does not cover, and the reason UPDATE carries both USING and WITH CHECK.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
begin
  update public.entries
     set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   where slug = 'thor-2011';
  raise exception 'FAIL: moved a row onto another user''s shelf';
exception
  when insufficient_privilege then null;
end $$;
commit;

-- ---------------------------------------------------------------------------
-- A signed-out visitor cannot touch the table at all. Not "sees zero rows" — the migration
-- revokes the grant, so this fails before RLS is even consulted.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
do $$
begin
  perform 1 from public.entries;
  raise exception 'FAIL: anon can read the entries table';
exception
  when insufficient_privilege then null;
end $$;
commit;

-- ---------------------------------------------------------------------------
-- The constraints, which are about data being meaningful rather than private.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
begin
  begin
    insert into public.entries (slug, rating) values ('rating-too-high-2020', 11);
    raise exception 'FAIL: accepted a rating above 10';
  exception when check_violation then null; end;

  begin
    insert into public.entries (slug, rating) values ('rating-too-low-2020', 0);
    raise exception 'FAIL: accepted a rating of 0';
  exception when check_violation then null; end;

  -- Unrated is a real state and must stay allowed: a CHECK only rejects FALSE, and
  -- `null between 1 and 10` is null.
  insert into public.entries (slug, rating) values ('not-rated-yet-2020', null);

  begin
    insert into public.entries (slug) values ('Not A Slug');
    raise exception 'FAIL: accepted a slug that the pipeline could never produce';
  exception when check_violation then null; end;
end $$;

-- updated_at is maintained by the database, so a client that never sends it still gets a
-- truthful value and a client that lies about it is overruled.
do $$
declare before timestamptz; after timestamptz;
begin
  select updated_at into before from public.entries where slug = 'iron-man-2008';
  update public.entries
     set rating = 8, updated_at = '1999-01-01'
   where slug = 'iron-man-2008';
  select updated_at into after from public.entries where slug = 'iron-man-2008';
  if after <= before then
    raise exception 'FAIL: updated_at was not maintained by the trigger (% -> %)', before, after;
  end if;
end $$;
commit;

\echo 'RLS: all checks passed'
