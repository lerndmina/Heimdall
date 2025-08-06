import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MinecraftPlayersList } from "@/components/dashboard/minecraft/minecraft-players-list";

export default async function MinecraftPlayersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <MinecraftPlayersList />;
}
