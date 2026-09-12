import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "lighthouse", "chrome-launcher"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
