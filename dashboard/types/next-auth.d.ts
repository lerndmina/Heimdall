import { DefaultSession, DefaultUser } from "next-auth";
import { AdapterUser } from "next-auth/adapters";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      avatar?: string;
      discriminator?: string;
    } & DefaultSession["user"];
    accessToken?: string;
  }

  interface User extends DefaultUser {
    discordId?: string;
    avatar?: string;
    discriminator?: string;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    discordId?: string;
    avatar?: string;
    discriminator?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
    avatar?: string;
    discriminator?: string;
    accessToken?: string;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    discordId?: string;
    avatar?: string;
    discriminator?: string;
  }
}
