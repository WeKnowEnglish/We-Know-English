import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone-on-LAN development host to load Next dev resources (HMR/runtime chunks).
  allowedDevOrigins: ["192.168.2.84", "localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      // Class feed media uploads pass File payloads through Server Actions.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
