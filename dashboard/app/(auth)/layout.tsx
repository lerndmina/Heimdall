import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { GuildProvider } from "@/components/dashboard/guild-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-discord-darkest">
      <GuildProvider userId={session.user.id}>
        <DashboardNav user={session.user} />
        <main className="container mx-auto px-4 py-8">{children}</main>
      </GuildProvider>
    </div>
  );
}
