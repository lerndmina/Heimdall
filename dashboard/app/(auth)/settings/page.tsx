import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsHome } from "@/components/dashboard/settings-home";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <SettingsHome />;
}
