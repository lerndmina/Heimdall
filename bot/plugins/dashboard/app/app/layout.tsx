import type { Metadata } from "next";
import SessionProvider from "@/components/providers/SessionProvider";
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
        {/* Animated background glow orbs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div className="absolute -left-[10%] top-[15%] h-[500px] w-[500px] animate-pulse rounded-full bg-primary-500/8 blur-[100px]" />
          <div className="absolute right-[0%] top-[50%] h-[400px] w-[400px] animate-pulse rounded-full bg-purple-500/6 blur-[100px] animation-delay-2000" />
          <div className="absolute left-[40%] -top-[5%] h-[350px] w-[350px] animate-pulse rounded-full bg-blue-500/5 blur-[80px] animation-delay-1000" />
          <div className="absolute left-[60%] bottom-[10%] h-[300px] w-[300px] animate-pulse rounded-full bg-primary-600/5 blur-[80px] animation-delay-3000" />
        </div>

        {/* Grid pattern overlay with radial fade */}
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#27272a30_1px,transparent_1px),linear-gradient(to_bottom,#27272a30_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)] z-0" />

        <div className="relative z-10">
          <SessionProvider>{children}</SessionProvider>
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
