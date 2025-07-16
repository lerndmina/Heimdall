"use client";

import { Shield } from "lucide-react";
import { useBotName } from "@/hooks/use-bot-info";
import { AuthButton } from "./auth-button";

export function LandingHero() {
  const botName = useBotName();

  return (
    <div className="text-center mb-16">
      <div className="flex items-center justify-center mb-6">
        <Shield className="h-16 w-16 text-discord-primary mr-4" />
        <h1 className="text-6xl font-bold text-white">{botName}</h1>
      </div>
      <p className="text-xl text-discord-text mb-8 max-w-2xl mx-auto">Professional Discord modmail management dashboard. Monitor, respond, and analyze your community interactions with ease.</p>
      <AuthButton />
    </div>
  );
}
