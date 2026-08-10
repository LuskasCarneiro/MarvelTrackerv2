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
};

export default nextConfig;
