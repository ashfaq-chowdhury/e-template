import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal .next/standalone server bundle ideal for multi-stage Docker builds
  output: "standalone",
  images: {
    remotePatterns: [
      {
        // Allow Next.js Image Optimization to load product media from Supabase Storage CDN
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;

