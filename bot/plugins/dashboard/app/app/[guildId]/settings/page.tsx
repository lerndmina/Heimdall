/**
 * Dashboard Settings page — Permissions management + general settings.
 *
 * Server component that renders the client-side SettingsPage.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SettingsPage from "./SettingsPage";

interface SettingsPageProps {
  params: Promise<{ guildId: string }>;
}

export default async function Page({ params }: SettingsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { guildId } = await params;

  return <SettingsPage guildId={guildId} />;
}
