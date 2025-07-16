import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

async function getBotName(): Promise<string> {
  return process.env.BOT_NAME || "Heimdall";
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
