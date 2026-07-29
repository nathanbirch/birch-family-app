import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Built as a static export so GitHub Pages can serve it: `next build` writes
   * plain HTML/CSS/JS to `out/`, with no Node server involved.
   */
  output: "export",

  /*
   * The default `next/image` loader optimises on demand from a server, which a
   * static host does not have. The photographs and avatars are already sized
   * for the app, so they ship as-is.
   */
  images: { unoptimized: true },
};

export default nextConfig;
