import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import { Archivo, Newsreader } from "next/font/google";
import AuthStatus from "@/components/AuthStatus";
import "./globals.css";

// wdth is what makes spine labels a real compressed cut rather than a squashed one.
// Without the explicit axes request, next/font ships wght only and the compression
// silently does nothing.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// opsz lets the same family read correctly at a 13px caption and a 20px paragraph.
// Browsers apply it automatically via font-optical-sizing once the axis is present.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  // Without metadataBase every Open Graph image resolves relative to whatever host served the
  // page, so a preview deployment would advertise itself as the canonical home of all 152
  // titles. One origin, stated once, in lib/seo.ts.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Marvel Tracker — the shelf",
    template: "%s · Marvel Tracker",
  },
  description:
    "Every Marvel film and series, kept as a shelf of home-video releases. The object tells you the era.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Marvel Tracker",
    locale: "en_GB",
    url: "/",
    title: "Marvel Tracker — the shelf",
    description:
      "Every Marvel film and series, kept as a shelf of home-video releases. The object tells you the era.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${archivo.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* The first thing a keyboard reaches, and only visible once it does. Without it,
            every page starts with the masthead's auth link, and /shelf starts with a canvas
            that swallows the arrow keys. */}
        <a
          href="#content"
          className="sr-only rounded bg-shelf-raised px-4 py-2 text-sm text-label-bright focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        {/* `shelf-chrome`: the masthead is chrome too, and §12 Q21 allows no exceptions. The
            class is inert everywhere else — the rule in globals.css only bites when <html>
            carries `data-chrome`, which only the shelf sets. */}
        <header className="shelf-chrome flex justify-end border-b border-shelf-edge px-6 py-4">
          <AuthStatus />
        </header>
        <div id="content" className="flex flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
