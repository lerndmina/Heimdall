"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogIn, LogOut } from "lucide-react";

export function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <Button disabled className="bg-discord-primary hover:bg-discord-secondary">
        Loading...
      </Button>
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-white">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={
                session.user.avatar
                  ? `https://cdn.discordapp.com/avatars/${session.user.id}/${session.user.avatar}.png`
                  : undefined
              }
            />
            <AvatarFallback>{session.user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <span>{session.user.name}</span>
        </div>
        <Button
          onClick={() => signOut()}
          variant="outline"
          className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => signIn("discord")}
      className="bg-discord-primary hover:bg-discord-secondary text-white font-semibold px-8 py-3 text-lg"
    >
      <LogIn className="h-5 w-5 mr-2" />
      Sign in with Discord
    </Button>
  );
}
