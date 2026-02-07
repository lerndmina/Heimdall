/**
 * Extended NextAuth type declarations for Heimdall dashboard.
 */
import "next-auth";
import "next-auth/jwt";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    accessToken: string;
    guilds: Guild[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    accessToken: string;
    guilds: Guild[];
  }
}
