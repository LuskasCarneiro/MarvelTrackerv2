import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// The only caller is src/app/auth/confirm/route.ts. Every other read of auth state is
// client-side (src/lib/supabase/client.ts), so the 152 prerendered title pages and "/"
// never touch cookies() in a layout or page and never opt into dynamic rendering.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // @supabase/ssr 0.12 also passes a `headers` argument here (cache-control
          // headers, so a CDN never caches a Set-Cookie response). Not applied: this
          // route already reads cookies(), which Next.js treats as a dynamic API and
          // therefore never caches by default for a GET Route Handler.
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}
