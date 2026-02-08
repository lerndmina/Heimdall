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
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#18181b",
              border: "1px solid #3f3f46",
              color: "#f4f4f5",
            },
          }}
        />
      </body>
    </html>
  );
}
