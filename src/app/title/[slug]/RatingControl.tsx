"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Entry = { watched: boolean; rating: number | null };

// Rating is stored 1..10 (supabase/migrations/20260810075811_entries.sql) and presented as
// five stars at half-star precision: step 7 renders as three and a half stars.
const RATING_STEPS = Array.from({ length: 10 }, (_, i) => i + 1);

function starLabel(step: number): string {
  return `${step / 2} star${step === 2 ? "" : "s"}`;
}

// Same idiom as AuthStatus: auth state and this title's row are both read entirely
// client-side via onAuthStateChange, never on the server, so /title/[slug] stays static.
export default function RatingControl({ slug }: { slug: string }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [entry, setEntry] = useState<Entry>({ watched: false, rating: null });
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let fetchedEntry = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(true);
      setSignedIn(!!session);
      if (fetchedEntry || !session) return;
      fetchedEntry = true;
      // One query for this user's row on this title. RLS scopes it to auth.uid(), so no
      // user_id filter is needed or sent.
      supabase
        .from("entries")
        .select("watched, rating")
        .eq("slug", slug)
        .maybeSingle()
        .then(({ data: row, error: fetchError }) => {
          if (fetchError) {
            // Degrade to the default unrated state rather than block the page: the title
            // is worth reading whether or not this loads.
            console.error(fetchError.message);
            return;
          }
          if (row) setEntry(row as Entry);
        });
    });
    return () => data.subscription.unsubscribe();
  }, [slug]);

  // Optimistic: local state moves immediately and is rolled back only if the database
  // rejects the write, so the UI never shows a value that did not save. `patch` is sent
  // as-is — a field left out of it is left alone by Postgres's upsert-merge rather than
  // overwritten — and user_id is never one of the keys, because the column defaults to
  // auth.uid() and the RLS policy checks it.
  const write = useCallback(
    async (patch: Partial<Entry>, rollbackTo: Entry) => {
      const id = ++requestId.current;
      const { error: writeError } = await createClient()
        .from("entries")
        .upsert({ slug, ...patch }, { onConflict: "user_id,slug" });
      if (id !== requestId.current) return; // a later write already superseded this one
      if (writeError) {
        // The wording is deliberately plain — why it failed is not a reader's problem —
        // but the real message is kept for whoever opens the console.
        console.error(writeError.message);
        setEntry(rollbackTo);
        setError("That didn’t save. Try again.");
      }
    },
    [slug],
  );

  // Rating is a radio group, and in a radio group focus and selection move together: one
  // held arrow key passes through every step on the way. Writing on each would be nine
  // round trips to get from half a star to five. So local state leads and only the value
  // settled on is sent.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

  const setRating = (rating: number | null) => {
    setError(null);
    const rollbackTo = entry;
    // Rating something is a stronger statement than having watched it, so a rating marks it
    // watched too. Clearing a rating says nothing either way and leaves watched alone.
    const patch: Partial<Entry> = rating === null ? { rating: null } : { rating, watched: true };
    setEntry((prev) => ({ ...prev, ...patch }));

    if (pending.current) clearTimeout(pending.current.timer);
    const run = () => {
      pending.current = null;
      void write(patch, rollbackTo);
    };
    pending.current = { timer: setTimeout(run, 400), run };
  };

  // Leaving the page inside the debounce window must not silently discard the rating, so
  // the pending write is flushed rather than cancelled. The component is going away and
  // will not see the result, which is fine — the row is what matters.
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      pending.current.run();
    },
    [],
  );

  function setWatched(watched: boolean) {
    setError(null);
    const rollbackTo = entry;
    setEntry((prev) => ({ ...prev, watched }));
    void write({ watched }, rollbackTo);
  }

  if (!ready) return null;

  if (!signedIn) {
    return (
      <p className="font-prose mt-10 border-t border-shelf-edge pt-6 text-label-mid">
        <Link
          href="/sign-in"
          className="text-label-bright underline decoration-label-dim underline-offset-4 transition duration-200 hover:text-tungsten"
        >
          Sign in
        </Link>{" "}
        to mark this watched or rate it.
      </p>
    );
  }

  const filledPct = entry.rating ? (entry.rating / 10) * 100 : 0;

  return (
    // Laid out as two more rows of the data block above it, because that is what they are:
    // runtime and year are the release's facts, watched and rating are yours.
    <div className="mt-10 border-t border-shelf-edge pt-6">
      <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
        <span className="text-xs uppercase tracking-wide text-label-dim">Watched</span>
        <input
          type="checkbox"
          checked={entry.watched}
          onChange={(event) => setWatched(event.target.checked)}
          className="h-4 w-4 accent-tungsten"
        />
      </label>

      <div className="flex items-center justify-between gap-4 border-t border-shelf-edge py-2.5">
        <span id="rating-label" className="text-xs uppercase tracking-wide text-label-dim">
          Rating
        </span>
        <fieldset aria-labelledby="rating-label" className="m-0 flex items-center gap-3 border-0 p-0">
          {/*
            The stars are the control's whole appearance and the radios beneath them are
            invisible. Both halves of that matter:

            - The inputs stay real `sr-only` radios rather than divs with click handlers, so
              arrow keys, selection-follows-focus and screen-reader announcement are the
              browser's job and not something to reimplement badly.
            - `sr-only` clips them to a pixel, so the global :focus-visible ring would land
              somewhere invisible. The ring is moved to this wrapper with `has-[...]`
              instead, and since selection follows focus in a radio group, the star fill
              below is itself the live feedback as you arrow through.
          */}
          <span className="relative inline-block rounded-[2px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-tungsten">
            <span aria-hidden="true" className="relative block text-base leading-none text-label-dim">
              ★★★★★
              {/* Two stacked rows, the tungsten one clipped to a percentage, so a half star
                  is a real half rather than a different glyph. */}
              <span
                className="absolute inset-0 overflow-hidden whitespace-nowrap text-tungsten"
                style={{ width: `${filledPct}%` }}
              >
                ★★★★★
              </span>
            </span>
            {RATING_STEPS.map((step) => (
              <input
                key={step}
                type="radio"
                name={`rating-${slug}`}
                checked={entry.rating === step}
                onChange={() => setRating(step)}
                aria-label={starLabel(step)}
                className="sr-only"
              />
            ))}
          </span>

          <span className="data-figure w-16 text-right text-sm text-label-mid">
            {entry.rating ? `${entry.rating / 2} / 5` : "Not rated"}
          </span>
        </fieldset>
      </div>

      {entry.rating !== null && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setRating(null)}
            className="font-display text-xs uppercase tracking-[0.15em] text-label-dim transition duration-200 hover:text-tungsten"
          >
            Clear rating
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-tungsten">
          {error}
        </p>
      )}
    </div>
  );
}
