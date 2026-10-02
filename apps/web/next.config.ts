import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost and 127.0.0.1 are different browser origins for the dev server.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
