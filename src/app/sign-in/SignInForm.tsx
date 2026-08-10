"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

// initialError comes from src/app/auth/confirm/route.ts, which redirects failures back
// here with the reason in the query string. The page reads it server-side (page.tsx) and
// hands it down as a plain prop, rather than this component reading it itself — reading
// window.location in an effect just to setState once is exactly what
// react-hooks/set-state-in-effect flags, and the value is already known before this
// component ever renders.
export default function SignInForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="font-prose mt-8 text-lg text-label-bright">
        Check your email to confirm your account — the link only works once you&rsquo;ve
        followed it.
      </p>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={6}
        />

        {error && (
          <p role="alert" className="text-sm text-tungsten">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full border border-shelf-edge bg-shelf-raised py-3 font-display text-xs uppercase tracking-[0.2em] text-label-bright transition duration-200 hover:border-tungsten disabled:opacity-50"
          style={{ fontVariationSettings: '"wdth" 100, "wght" 600' }}
        >
          {loading ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
        }}
        className="mt-6 font-display text-xs uppercase tracking-[0.15em] text-label-dim transition duration-200 hover:text-tungsten"
      >
        {mode === "sign-in" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="font-display text-xs uppercase tracking-[0.15em] text-label-dim">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        className="mt-2 w-full border border-shelf-edge bg-shelf-dark px-3 py-2 text-label-bright outline-none"
      />
    </label>
  );
}
