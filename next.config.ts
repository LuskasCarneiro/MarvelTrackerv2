import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge sits on top of the shelf and lands in every screenshot the
  // harness takes, which makes captures a poor record of what the page looks like.
  devIndicators: false,

  images: {
    /*
      Artwork is served from TMDB's public image CDN rather than committed to the repo.
      That path needs no API key, so nothing secret reaches the browser, and it keeps ~450
      files out of git. What *is* committed is data/artwork.json: the chosen paths plus the
      palette extracted from each poster at build time, because colour extraction needs the
      pixels and must not happen on the client.

      Scoped tightly on purpose — host, protocol, path prefix and no query string — so this
      cannot be used to proxy arbitrary images through our optimiser.

      Phase 3 is different: the 3D shelf needs packed KTX2/Basis texture atlases, which are
      build artefacts and will be committed. This decision covers the DOM layer only.
    */
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        port: '',
        pathname: '/t/p/**',
        search: '',
      },
    ],
  },

  /*
    Anything under public/ is served `Cache-Control: public, max-age=0` by default, and the
    cover atlas is 3 MB of it — so every visit to /shelf re-downloaded the whole thing.
    Measured in a browser, not guessed: `/atlas/covers-0.webp  3001 KB  [cache: max-age=0]`.

    `immutable` is only honest because scripts/build-atlas.ts now names each atlas after a
    hash of its own bytes, so a new atlas is a new URL and this header can never pin a stale
    one. The scene reads the name out of data/atlas.json and never hardcodes it.
  */
  async headers() {
    return [
      {
        source: "/atlas/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
