"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Reads auth state entirely client-side via onAuthStateChange, which fires once
// immediately with the current session (event "INITIAL_SESSION") and again on every
// change after that — no separate getSession() call needed. This is why the root layout
// can stay a Server Component and "/" and every "/title/[slug]" stay static: nothing here
// ever runs on the server.
export default function AuthStatus() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  if (!session) {
    return (
      <Link
        href="/sign-in"
        className="font-display text-xs uppercase tracking-[0.15em] text-label-dim transition duration-200 hover:text-tungsten"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="font-display text-xs text-label-dim">{session.user.email}</span>
      <button
        type="button"
        onClick={handleSignOut}
        className="font-display text-xs uppercase tracking-[0.15em] text-label-dim transition duration-200 hover:text-tungsten"
      >
        Sign out
      </button>
    </div>
  );
}

async function handleSignOut() {
  // { scope: "local" } signs out only this browser session. The library's default,
  // "global", signs the user out of every device they're currently signed in on, which is
  // not what a "Sign out" button should do.
  const { error } = await createClient().auth.signOut({ scope: "local" });
  if (error) console.error(error.message);
}
