import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CachedServerSelector } from "@/components/auth/cached-server-selector";
import { ServerSelectLayout } from "@/components/auth/server-select-layout";

export default async function ServerSelectPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <ServerSelectLayout user={session.user}>
      <CachedServerSelector user={session.user} />
    </ServerSelectLayout>
  );
}
