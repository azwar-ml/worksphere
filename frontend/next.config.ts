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
        // If your Next.js frontend calls endpoints starting with /api/ (e.g., /api/chat)
        source: "/api/:path*",
        // Forward them to the internal FastAPI server
        destination: "http://127.0.0.1:8000/:path*",
      },
    ];
  },
};

export default nextConfig;