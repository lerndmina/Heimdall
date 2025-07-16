import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

async function getBotName(): Promise<string> {
  try {
    // Use our existing API route instead of duplicating Discord API logic
    const response = await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/bot-info`, {
      // Add cache headers to avoid excessive API calls during build
      cache: "force-cache",
      next: { revalidate: 3600 }, // Revalidate every hour
      // Add timeout to avoid hanging during build
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return "Heimdall";
    }

    const data = await response.json();
    return data.name || "Heimdall";
  } catch (error) {
    console.error("Error fetching bot name for metadata:", error);
    return "Heimdall";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const botName = await getBotName();

  return {
    title: `${botName} Dashboard`,
    description: `Web dashboard for ${botName} Discord Bot - Manage modmail, view transcripts, and monitor your server.`,
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
