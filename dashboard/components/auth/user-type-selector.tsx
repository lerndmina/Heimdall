"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Settings, FileText, Users, ArrowRight, Shield, User } from "lucide-react";
import { useRole } from "./role-provider";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface UserTypeSelectorProps {
  user: User;
}

export function UserTypeSelector({ user }: UserTypeSelectorProps) {
  const router = useRouter();
  const { setUserRole } = useRole();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleUserPath = async () => {
    setIsLoading("user");
    setUserRole("user");
    // Navigate to user transcripts
    router.push("/my-tickets");
  };

  const handleStaffPath = async () => {
    setIsLoading("staff");
    setUserRole("staff");
    // Navigate to server selection
    router.push("/server-select");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-2 gap-8">
        {/* User Path */}
        <Card className="bg-discord-dark/50 backdrop-blur border-discord-darker hover:border-discord-primary/50 transition-all cursor-pointer group">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-discord-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-discord-primary/30 transition-colors">
              <User className="h-8 w-8 text-discord-primary" />
            </div>
            <CardTitle className="text-white text-xl">I'm a User</CardTitle>
            <CardDescription className="text-discord-muted">View your own ticket transcripts and conversation history</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3 mb-6">
              <div className="flex items-center text-discord-text">
                <FileText className="h-4 w-4 text-discord-primary mr-3" />
                <span>View your ticket transcripts</span>
              </div>
              <div className="flex items-center text-discord-text">
                <MessageSquare className="h-4 w-4 text-discord-primary mr-3" />
                <span>Download conversation history</span>
              </div>
              <div className="flex items-center text-discord-text">
                <Settings className="h-4 w-4 text-discord-primary mr-3" />
                <span>Manage privacy settings</span>
              </div>
            </div>
            <Button onClick={handleUserPath} disabled={!!isLoading} className="w-full bg-discord-primary hover:bg-discord-secondary text-white font-medium">
              {isLoading === "user" ? (
                "Loading..."
              ) : (
                <>
                  View My Tickets
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Staff Path */}
        <Card className="bg-discord-dark/50 backdrop-blur border-discord-darker hover:border-discord-success/50 transition-all cursor-pointer group">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-discord-success/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-discord-success/30 transition-colors">
              <Shield className="h-8 w-8 text-discord-success" />
            </div>
            <CardTitle className="text-white text-xl">I'm Staff</CardTitle>
            <CardDescription className="text-discord-muted">Manage modmail for Discord servers you moderate</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3 mb-6">
              <div className="flex items-center text-discord-text">
                <Users className="h-4 w-4 text-discord-success mr-3" />
                <span>Manage server modmail</span>
              </div>
              <div className="flex items-center text-discord-text">
                <MessageSquare className="h-4 w-4 text-discord-success mr-3" />
                <span>View all server tickets</span>
              </div>
              <div className="flex items-center text-discord-text">
                <Settings className="h-4 w-4 text-discord-success mr-3" />
                <span>Configure modmail settings</span>
              </div>
            </div>
            <Button onClick={handleStaffPath} disabled={!!isLoading} className="w-full bg-discord-success hover:bg-discord-success/80 text-white font-medium">
              {isLoading === "staff" ? (
                "Loading..."
              ) : (
                <>
                  Select Server
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      <div className="text-center mt-12">
        <p className="text-discord-muted mb-4">Can't find what you're looking for? You can always switch between these modes later.</p>
        <Button variant="ghost" className="text-discord-text hover:text-white" onClick={() => router.push("/help")}>
          Need Help?
        </Button>
      </div>
    </div>
  );
}
