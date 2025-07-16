import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import { prisma } from "./prisma";

export const config = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify email guilds",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt", // Force JWT strategy to ensure access token is available
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // When account and profile are available (first login), store Discord data
      if (account && profile) {
        token.discordId = profile.id as string;
        token.avatar = (profile as any).avatar as string;
        token.discriminator = (profile as any).discriminator as string;
        token.accessToken = account.access_token;
      }

      return token;
    },
    async session({ session, token }) {
      // Always use data from the JWT token
      if (token) {
        session.user.id = token.discordId as string;
        session.user.avatar = token.avatar as string;
        session.user.discriminator = token.discriminator as string;
        session.accessToken = token.accessToken as string;
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
