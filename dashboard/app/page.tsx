import { auth } from "@/lib/auth";
import { AuthButton } from "@/components/auth/auth-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { UserTypeSelector } from "@/components/auth/user-type-selector";
import { HeroSection } from "@/components/auth/hero-section";
import { LandingHero } from "@/components/auth/landing-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, MessageSquare, BarChart3, FileText } from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  // If user is authenticated, show user type selection
  if (session?.user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
        {/* Sign Out Button */}
        <div className="absolute top-6 right-6">
          <SignOutButton />
        </div>

        <div className="container mx-auto px-4 py-16">
          {/* Header */}
          <HeroSection userName={session.user.name} />

          <UserTypeSelector user={session.user} />
        </div>
      </div>
    );
  }

  // If user is not authenticated, show the landing page
  return (
    <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <LandingHero />

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="bg-discord-dark border-discord-darker">
            <CardHeader>
              <CardTitle className="flex items-center text-white">
                <MessageSquare className="h-6 w-6 text-discord-primary mr-2" />
                Modmail Management
              </CardTitle>
              <CardDescription className="text-discord-muted">View and manage all modmail threads in one place</CardDescription>
            </CardHeader>
            <CardContent className="text-discord-text">
              <ul className="space-y-2">
                <li>• Real-time thread monitoring</li>
                <li>• Advanced filtering and search</li>
                <li>• Bulk actions and automation</li>
                <li>• Staff assignment tracking</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-discord-dark border-discord-darker">
            <CardHeader>
              <CardTitle className="flex items-center text-white">
                <FileText className="h-6 w-6 text-discord-primary mr-2" />
                Beautiful Transcripts
              </CardTitle>
              <CardDescription className="text-discord-muted">Generate and share conversation transcripts</CardDescription>
            </CardHeader>
            <CardContent className="text-discord-text">
              <ul className="space-y-2">
                <li>• Discord-styled transcript viewer</li>
                <li>• Export to HTML, PDF, or JSON</li>
                <li>• Shareable links for transparency</li>
                <li>• Attachment handling and preview</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-discord-dark border-discord-darker">
            <CardHeader>
              <CardTitle className="flex items-center text-white">
                <BarChart3 className="h-6 w-6 text-discord-primary mr-2" />
                Analytics & Insights
              </CardTitle>
              <CardDescription className="text-discord-muted">Monitor performance and response metrics</CardDescription>
            </CardHeader>
            <CardContent className="text-discord-text">
              <ul className="space-y-2">
                <li>• Response time analytics</li>
                <li>• Volume and trend tracking</li>
                <li>• Staff performance metrics</li>
                <li>• Community health insights</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-discord-muted">
          <p>Built with Next.js, TypeScript, and Tailwind CSS</p>
          <p className="mt-2">Secure Discord OAuth authentication</p>
        </div>
      </div>
    </div>
  );
}
