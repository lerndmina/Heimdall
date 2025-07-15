import { AuthButton } from "@/components/auth/auth-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, MessageSquare, BarChart3, FileText } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-16 w-16 text-discord-primary mr-4" />
            <h1 className="text-6xl font-bold text-white">Heimdall</h1>
          </div>
          <p className="text-xl text-discord-text mb-8 max-w-2xl mx-auto">
            Professional Discord modmail management dashboard. Monitor, respond, and analyze your
            community interactions with ease.
          </p>
          <AuthButton />
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="bg-discord-dark border-discord-darker">
            <CardHeader>
              <CardTitle className="flex items-center text-white">
                <MessageSquare className="h-6 w-6 text-discord-primary mr-2" />
                Modmail Management
              </CardTitle>
              <CardDescription className="text-discord-muted">
                View and manage all modmail threads in one place
              </CardDescription>
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
              <CardDescription className="text-discord-muted">
                Generate and share conversation transcripts
              </CardDescription>
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
              <CardDescription className="text-discord-muted">
                Monitor performance and response metrics
              </CardDescription>
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
