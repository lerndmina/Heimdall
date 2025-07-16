/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["cdn.discordapp.com", "avatars.githubusercontent.com"],
  },
  // Remove env injection - environment variables will be read at runtime instead of build time
  // This allows the same built image to work in different environments
};

module.exports = nextConfig;
