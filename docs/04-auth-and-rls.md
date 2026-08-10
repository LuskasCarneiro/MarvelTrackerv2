# Auth and Row Level Security

Accounts, and the privacy promise. The code is in `src/lib/supabase/`, `src/app/sign-in/`,
`src/app/auth/confirm/` and `supabase/`. This file holds what the code cannot say.

---

## ⚠ Owner action required — sign-up is broken on the live site until this is done

**Supabase's Site URL is still `http://localhost:3000` and the deployed domain is not in the
redirect allow-list.** Measured, not assumed — asking the auth server directly:

| redirect_to | result |
|---|---|
| `https://marvel-trackerv2.vercel.app/auth/confirm` | **blocked** → falls back to `http://localhost:3000` |
| `http://localhost:3000/auth/confirm` | allowed |
| `https://evil.example.com/steal` | blocked *(the mechanism works — the list is just wrong)* |

So a real person signing up on the live site receives a confirmation email whose link sends
them to `http://localhost:3000`, which on their machine is nothing at all. The account is
created and can never be confirmed. **The site looks like it works and the deploy is green**
— which is the same shape of fault as the Phase 0 deployment bug, arriving from a different
direction.

Fix, in the Supabase dashboard under **Authentication → URL Configuration**:

1. Set **Site URL** to `https://marvel-trackerv2.vercel.app`
2. Add to **Redirect URLs**: `https://marvel-trackerv2.vercel.app/**` and keep
   `http://localhost:3000/**` for local work

Re-run the check in this file's table to confirm; it needs no credentials beyond `.env`.

**Also worth knowing before real users arrive:** Supabase's built-in email service is rate
limited to a handful of messages per hour, and it is intended for development. Public
sign-up is a settled decision, so custom SMTP will be needed before this is announced
anywhere. Not a code change.

---

## The security model

**Private shelves are enforced by Row Level Security and by nothing else.**

The browser talks to PostgREST directly, as the signed-in user, using the publishable key.
There is no server-side data layer to put a check in, and that is deliberate rather than a
shortcut:

- **There is no service-role key anywhere in this project** — not in `.env`, not in Vercel,
  not in GitHub. Nothing can be tricked into acting as an admin because nothing is able to.
- Adding an application-code check *as well* would create two places that decide who may
  read a row, and therefore somewhere for them to disagree. The policy is the boundary.
- The two `NEXT_PUBLIC_SUPABASE_*` values are public by design. They identify the project;
  they do not authorise anything. Treating them as secret would be cargo-culting.

`supabase/migrations/` holds the table and its four policies, one per operation rather than
a single `FOR ALL`, so that changing one cannot silently widen the others.

**UPDATE carries both `USING` and `WITH CHECK`.** `USING` alone decides which rows you may
change and would still let you change one of *your* rows to have someone else's `user_id`,
posting a row onto their shelf. The test below covers exactly that case.

### It is tested, not asserted

`npm run test:rls` runs `supabase/tests/rls.sql` against a real Postgres — in CI on every
push, via a `postgres:16` service container. It proves, and fails loudly otherwise:

- one user cannot read, update or delete another's rows
- one user cannot insert a row onto another's shelf
- one user cannot move their own row onto another's shelf
- a signed-out visitor cannot touch the table at all
- the rating and slug constraints hold, and `updated_at` is the database's to set

**A blocked `UPDATE` is not an error — it matches zero rows.** That is precisely why this
needs a test: a policy gap here does not throw, it just quietly works, and looks like a
working feature from the outside.

**The test was checked against a deliberately broken policy before being trusted.** With the
read policy replaced by `using (true)`, it fails with
`FAIL: another user's shelf is readable — saw 2 rows` and exit code 3. A guard that has
never failed is not yet known to be a guard.

`supabase/tests/harness.sql` mirrors just enough Supabase to run the policies on bare
Postgres — the `anon`/`authenticated` roles, the `auth` schema, and Supabase's real
definition of `auth.uid()` copied rather than approximated. **The risk it carries is
drifting from real Supabase**, so it is commented with what each piece mirrors. The
migration it applies is the same file CI applies to production.

Why not `supabase start`: it pulls GoTrue, PostgREST, Studio and Kong to test four policies
that are plain Postgres. Why not test against the real project: creating two confirmed users
there needs either a service-role key this project deliberately does not have, or two real
mailboxes — and writing to production to prove production is private is a poor trade.

---

## Why auth state is read client-side

`/` and all 152 `/title/[slug]` pages are prerendered at build time. **One `await cookies()`
or server-side `getUser()` in a layout or page opts every one of them into dynamic
rendering** and throws away Phase 1's work.

The catalogue is public and identical for every visitor; only small interactive parts differ
per user. So auth state is read only in Client Components, which are just JavaScript shipped
to the browser and do not affect a page's static-ness.

`src/lib/supabase/server.ts` exists for exactly one caller — the email confirmation route,
which must set cookies. It should stay that way. **Check the build's route table after any
change here**: `○ /` and `● /title/...` mean it still holds; `ƒ` means it does not.

`/sign-in` is dynamic, which is fine and expected — it reads `searchParams` to show the
error the confirmation route redirects back with.

---

## Next.js 16 traps

Every Supabase SSR guide in circulation gets both of these wrong for this version.

1. **`middleware.ts` is deprecated and renamed to `proxy.ts`**, with the export named
   `proxy`. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
   **We have neither**, and that is correct: a proxy exists to refresh tokens for
   server-side session reads, nothing here reads the session server-side, and the browser
   client refreshes its own token. Do not add one back by reflex.
2. **`cookies()` is async** and must be awaited.

---

## Decisions worth not relitigating

- **One route does sign-in and sign-up.** Same two fields; two near-identical pages is
  duplication for nothing.
- **No `zod`.** HTML `type="email"`, `required` and `minlength`, plus Supabase's own
  validation, cover two fields. A validation dependency here would be weight.
- **Supabase's real error messages are shown to the user.** Someone who typed the wrong
  password needs to know that, not "something went wrong".
- **`signOut({ scope: 'local' })`.** The library defaults to `global`, which signs the user
  out on every device they own — not what a sign-out button should do.
- **No profiles table.** Shelves are private and nothing about a user is public, so there is
  nothing for it to hold.
- **The catalogue stays in git, not Postgres.** `entries.slug` has no foreign key on
  purpose: the catalogue is build-time data regenerated by a pipeline, and mirroring 152
  rows into the database would mean a migration every time it runs. A slug matching nothing
  renders nothing, and only ever on the shelf of the user who wrote it.
- **Rate limiting is Supabase's**, not ours. It rate-limits auth endpoints per IP out of the
  box. Writing our own would need server-side state this architecture deliberately does not
  have. Public sign-up with abuse protection is the settled decision; if the built-in limits
  prove insufficient, that is a platform setting, not application code.

---

## Migrations

`.github/workflows/migrate.yml`, triggered only when a file under `supabase/migrations/`
changes, plus manual dispatch. Credentials (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`)
live in GitHub Actions secrets and on no laptop.

Deliberately **not** part of `ci.yml`: that runs on every push and every pull request, and
schema changes should not be applied from a fork's PR or re-run because a README changed.
`concurrency` queues rather than cancels — cancelling a job midway through applying DDL is
how migration history gets corrupted.

`supabase/config.toml` commits the project ref. It is the subdomain of
`NEXT_PUBLIC_SUPABASE_URL` and already ships in the client bundle of a public website, so
committing it exposes nothing new and saves a second secret.
