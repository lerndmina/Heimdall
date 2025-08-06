import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MinecraftDashboard } from "@/components/dashboard/minecraft/minecraft-dashboard";

export default async function MinecraftPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <MinecraftDashboard />;
}
