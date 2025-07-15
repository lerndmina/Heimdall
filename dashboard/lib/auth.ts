import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import type { NextAuthConfig } from "next-auth";

export const config = {
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.discordId = profile.id;
        token.avatar = profile.avatar;
        token.discriminator = profile.discriminator;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.discordId as string;
        session.user.avatar = token.avatar as string;
        session.user.discriminator = token.discriminator as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
