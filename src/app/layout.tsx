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
        <header className="flex justify-end border-b border-shelf-edge px-6 py-4">
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}
