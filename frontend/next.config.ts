import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add this block to proxy API requests to Python
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
  // Keep any other config settings you already have below
};

export default nextConfig;