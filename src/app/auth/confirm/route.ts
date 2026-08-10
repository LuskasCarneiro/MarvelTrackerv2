import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Completes email confirmation. mailer_autoconfirm is off, so every sign-up lands here via
// the link Supabase emails. Which query shape arrives depends on the dashboard's email
// template, so both are handled rather than assuming one.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("This confirmation link is missing its code.") };

  if (!error) {
    return NextResponse.redirect(new URL("/", origin));
  }

  return NextResponse.redirect(
    new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, origin),
  );
}
