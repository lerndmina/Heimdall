/**
 * NextAuth v5 configuration — Discord OAuth with JWT sessions.
 * No DB adapter; guild list is stored in the JWT.
 */
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/** Discord OAuth scopes */
const DISCORD_SCOPES = "identify guilds";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        url: "https://discord.com/api/oauth2/authorize",
        params: { scope: DISCORD_SCOPES },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token ?? "";
        token.userId = account.providerAccountId;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId;
      session.accessToken = token.accessToken;
      return session;
    },

    /** Called by middleware — returns true if user is authenticated */
    authorized({ auth: session, request }) {
      const isLoggedIn = !!session?.user;
      const isOnLogin = request.nextUrl.pathname.startsWith("/login");

      if (isOnLogin) return true; // Always allow login page
      return isLoggedIn; // Redirect to login if not authenticated
    },
  },

  pages: {
    signIn: "/login",
  },
});
