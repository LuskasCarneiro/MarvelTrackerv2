import { createBrowserClient } from "@supabase/ssr";

// createBrowserClient is a singleton in a browser context by default (it detects `window`
// and reuses one instance), so every Client Component can call this directly rather than
// threading a client through props or context.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
