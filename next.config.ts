import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge sits on top of the shelf and lands in every screenshot the
  // harness takes, which makes captures a poor record of what the page looks like.
  devIndicators: false,
};

export default nextConfig;
