import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A served build and `next dev` cannot share one output directory: the dev server rewrites it
  // while the running build reads chunks from it. The public preview builds into its own.
  distDir: process.env.BERUNI_DIST_DIR ?? ".next",
  // The review link is opened by people who are not developing the site, and the corner badge of
  // `next dev` reads as part of the page to them. It never appears in a production build anyway.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Preview frames inside the admin panel are same-origin, so a page must be frameable by
          // this site itself but by nobody else.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
