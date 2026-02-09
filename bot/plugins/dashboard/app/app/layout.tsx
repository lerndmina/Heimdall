import type { Metadata } from "next";
import SessionProvider from "@/components/providers/SessionProvider";
import AnimatedBackground from "@/components/layout/AnimatedBackground";
import { WebSocketProvider } from "@/lib/websocket";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heimdall Dashboard",
  description: "Manage your Heimdall Discord bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-linear-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100 antialiased">
        <AnimatedBackground />

        <div className="relative z-10">
          <SessionProvider>
            <WebSocketProvider>{children}</WebSocketProvider>
          </SessionProvider>
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(24, 24, 27, 0.8)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(63, 63, 70, 0.3)",
              color: "#f4f4f5",
            },
          }}
        />
      </body>
    </html>
  );
}
