import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ServerSelector } from "@/components/auth/server-selector";

export default async function ServerSelectPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
      <div className="container mx-auto px-4 py-16">
        <ServerSelector user={session.user} />
      </div>
    </div>
  );
}
