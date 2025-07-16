import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserTickets } from "@/components/user/user-tickets";

export default async function MyTicketsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
      <div className="container mx-auto px-4 py-16">
        <UserTickets user={session.user} />
      </div>
    </div>
  );
}
