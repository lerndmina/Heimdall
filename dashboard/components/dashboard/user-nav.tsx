"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Settings, LogOut, Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut } from "next-auth/react";
import { useRole } from "../auth/role-provider";
import { useBotName } from "@/hooks/use-bot-info";

const userNavigation = [
  {
    name: "My Tickets",
    href: "/my-tickets",
    icon: FileText,
  },
];

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

export function UserNav({ user }: { user: User }) {
  const pathname = usePathname();
  const { clearRole } = useRole();
  const botName = useBotName();

  const handleBackToRoleSelection = () => {
    clearRole();
    window.location.href = "/";
  };

  return (
    <nav className="bg-discord-dark border-b border-discord-darker">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Back Button */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-discord-primary" />
              <span className="font-bold text-xl text-white">{botName}</span>
            </Link>

            <Button onClick={handleBackToRoleSelection} variant="ghost" size="sm" className="text-discord-text hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Switch Mode
            </Button>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-4">
            {userNavigation.map((item) => {
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : user.image || undefined} />
                <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block">{user.name}</span>
            </div>

            <Button onClick={() => signOut()} variant="ghost" size="sm" className="text-discord-text hover:text-white">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-discord-darker">
        <div className="px-2 py-3 space-y-1">
          <Button onClick={handleBackToRoleSelection} variant="ghost" size="sm" className="w-full justify-start text-discord-text hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Switch Mode
          </Button>

          {userNavigation.map((item) => {
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
