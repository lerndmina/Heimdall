import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MinecraftConfig } from "@/components/dashboard/minecraft/minecraft-config";

export default async function MinecraftConfigPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <MinecraftConfig />;
}
