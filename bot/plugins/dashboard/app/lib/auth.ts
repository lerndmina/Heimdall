/**
 * NextAuth v5 configuration — Discord OAuth with JWT sessions.
 * No DB adapter; guild list is stored in the JWT.
 */
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/** Discord OAuth scopes */
const DISCORD_SCOPES = "identify guilds";

/** Permission bit for Manage Guild */
const MANAGE_GUILD = 0x20n;

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

        // Fetch user's guilds from Discord API
        try {
          const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
            headers: { Authorization: `Bearer ${account.access_token}` },
          });

          if (res.ok) {
            const guilds = await res.json();

            // Filter to guilds where user has ManageGuild permission
            token.guilds = guilds
              .filter((g: { permissions: string }) => {
                const perms = BigInt(g.permissions);
                // Owner flag (0x8) or ManageGuild (0x20)
                return (perms & 0x8n) !== 0n || (perms & MANAGE_GUILD) !== 0n;
              })
              .map((g: { id: string; name: string; icon: string | null }) => ({
                id: g.id,
                name: g.name,
                icon: g.icon,
              }));
          } else {
            token.guilds = [];
          }
        } catch {
          token.guilds = [];
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId;
      session.accessToken = token.accessToken;
      session.guilds = token.guilds;
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
