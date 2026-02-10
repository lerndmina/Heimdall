/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow dev origins for HMR through tunnels/proxies
  allowedDevOrigins: process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : [],

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
      { protocol: "https", hostname: "r2-bifrost.lerndmina.dev" }, // R2 custom domain
    ],
    // Optimize images aggressively
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Performance optimizations
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  // Disable X-Powered-By header in all environments
  poweredByHeader: false,

  // Compression - enable gzip/brotli
  compress: true,

  // Optimize chunk loading
  experimental: {
    optimizePackageImports: ["react-icons", "lucide-react", "date-fns"],
  },

  // Production only: aggressive caching
  ...(process.env.NODE_ENV === "production" && {
    generateEtags: true,
  }),
};

export default nextConfig;
