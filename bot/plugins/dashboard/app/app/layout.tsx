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
      <body className="min-h-screen bg-ui-bg-canvas text-ui-text-primary antialiased">
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
              background: "var(--color-ui-bg-surface)",
              border: "1px solid color-mix(in srgb, var(--color-ui-border) 70%, transparent)",
              color: "var(--color-ui-text-primary)",
            },
          }}
        />
      </body>
    </html>
  );
}
