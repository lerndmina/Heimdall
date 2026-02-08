/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow dev origins for HMR through tunnels/proxies
  allowedDevOrigins: ["*", "cope-sound-amanda-thanks.trycloudflare.com"],

  // Output as standalone for Docker builds
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,

  // Disable Next.js telemetry
  env: {
    NEXT_TELEMETRY_DISABLED: "1",
  },

  // TypeScript — use the app-local tsconfig
  typescript: {
    tsconfigPath: "./tsconfig.json",
  },

  // Allow external images from Discord CDN and MC heads
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "mc-heads.net" },
    ],
  },
};

export default nextConfig;
