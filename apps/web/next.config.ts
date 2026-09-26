import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@vibecodemaxxing/contracts",
    "@vibecodemaxxing/game-engine",
    "@vibecodemaxxing/vision",
  ],
};

export default nextConfig;
