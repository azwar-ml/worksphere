import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ignore type errors during production builds
    ignoreBuildErrors: true,
  },
  // Proxy API requests to Python FastAPI backend
  async rewrites() {
    return [
      {
        // Catch all frontend requests starting with /api/
        source: "/api/:path*",
        // Forward them to FastAPI, keeping the /api/ intact
        destination: "http://127.0.0.1:8000/api/:path*", 
      },
    ];
  },
};

export default nextConfig;