"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, MessageSquare, BarChart3, FileText, Settings, LogOut, ArrowLeft, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGuild } from "./guild-provider";
import { GuildSelector } from "./guild-selector";
import { useRole } from "../auth/role-provider";
import { signOut } from "next-auth/react";
import { useBotName } from "@/hooks/use-bot-info";
import { useState, useEffect } from "react";

interface FeatureFlags {
  minecraft: boolean;
}

const baseNavigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
  },
  {
    name: "Modmail",
    href: "/modmail",
    icon: MessageSquare,
  },
  {
    name: "Transcripts",
    href: "/transcripts",
    icon: FileText,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

const minecraftNavItem = {
  name: "Minecraft",
  href: "/minecraft",
  icon: Server,
};

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

export function DashboardNav({ user }: { user: User }) {
  const pathname = usePathname();
  const { selectedGuild, isLoading } = useGuild();
  const { clearRole } = useRole();
  const botName = useBotName();
  const [navigation, setNavigation] = useState(baseNavigation);

  // Fetch feature flags and build navigation
  useEffect(() => {
    async function fetchFeatureFlags() {
      try {
        const response = await fetch("/api/features");
        if (response.ok) {
          const features: FeatureFlags = await response.json();

          // Build navigation based on feature flags
          const nav = [...baseNavigation];

          // Add Minecraft tab if enabled
          if (features.minecraft) {
            // Insert Minecraft after Modmail (index 1)
            nav.splice(2, 0, minecraftNavItem);
          }

          setNavigation(nav);
        }
      } catch (error) {
        console.error("Failed to fetch feature flags:", error);
        // Fallback to base navigation without Minecraft
        setNavigation(baseNavigation);
      }
    }

    fetchFeatureFlags();
  }, []);

  const handleBackToRoleSelection = () => {
    clearRole();
    window.location.href = "/";
  };

  return (
    <nav className="bg-discord-dark border-b border-discord-darker">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo, Switch Mode, and Guild Selector */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0 flex-1">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <Shield className="h-6 sm:h-8 w-6 sm:w-8 text-discord-primary" />
              <span className="font-bold text-base sm:text-xl text-white hidden xs:block">{botName}</span>
            </Link>

            <Button onClick={handleBackToRoleSelection} variant="ghost" size="sm" className="text-discord-text hover:text-white text-xs sm:text-sm p-1 sm:p-2">
              <ArrowLeft className="h-3 sm:h-4 w-3 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Switch Mode</span>
              <span className="sm:hidden">Switch</span>
            </Button>

            {!isLoading && (
              <div className="hidden sm:block">
                <GuildSelector />
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <div className="hidden lg:flex items-center space-x-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-discord-primary text-white" : "text-discord-text hover:bg-discord-darker hover:text-white"
                  }`}>
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-white">
              <Avatar className="h-6 sm:h-8 w-6 sm:w-8">
                <AvatarImage src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : user.image || undefined} />
                <AvatarFallback className="text-xs sm:text-sm">{user.name?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm">{user.name}</span>
            </div>

            <Button onClick={() => signOut()} variant="ghost" size="sm" className="text-discord-text hover:text-white p-1 sm:p-2">
              <LogOut className="h-3 sm:h-4 w-3 sm:w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="lg:hidden border-t border-discord-darker">
        <div className="px-2 py-3 space-y-1">
          {/* Guild Selector on mobile */}
          {!isLoading && (
            <div className="mb-3">
              <GuildSelector />
            </div>
          )}

          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "bg-discord-primary text-white" : "text-discord-text hover:bg-discord-darker hover:text-white"
                }`}>
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
