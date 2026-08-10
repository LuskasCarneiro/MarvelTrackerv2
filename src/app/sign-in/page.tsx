import Link from "next/link";
import type { Metadata } from "next";
import SignInForm from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error } = await searchParams;
  const initialError = Array.isArray(error) ? (error[0] ?? null) : (error ?? null);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <Link
        href="/"
        className="font-display text-xs uppercase tracking-[0.15em] text-label-dim transition duration-200 hover:text-tungsten"
        style={{ fontVariationSettings: '"wdth" 100, "wght" 500' }}
      >
        <span aria-hidden="true">&larr; </span>Back to the shelf
      </Link>

      <h1
        className="mt-8 font-display text-3xl text-label-bright"
        style={{ fontVariationSettings: '"wdth" 88, "wght" 700' }}
      >
        Sign in
      </h1>
      <p className="font-prose mt-3 text-lg text-label-mid">
        One account, one private shelf. Sign in, or create an account with the same two
        fields below.
      </p>

      <SignInForm initialError={initialError} />
    </main>
  );
}
