"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <Button onClick={() => signOut()} variant="ghost" size="sm" className="text-discord-text hover:text-white">
      <LogOut className="h-4 w-4 mr-2" />
      Sign Out
    </Button>
  );
}
