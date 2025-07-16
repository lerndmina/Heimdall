import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SmartNav } from "@/components/dashboard/smart-nav";
import { GuildProvider } from "@/components/dashboard/guild-provider";
import { AuthLayoutWrapper } from "@/components/dashboard/auth-layout-wrapper";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-discord-darkest">
      <AuthLayoutWrapper user={session.user}>
        <SmartNav user={session.user} />
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-full overflow-x-hidden">{children}</main>
      </AuthLayoutWrapper>
    </div>
  );
}
