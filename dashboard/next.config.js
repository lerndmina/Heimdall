/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["cdn.discordapp.com", "avatars.githubusercontent.com"],
  },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    BOT_API_URL: process.env.BOT_API_URL,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
  },
};

module.exports = nextConfig;
