import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserTickets } from "@/components/user/user-tickets";
import { UserTicketsLayout } from "@/components/user/user-tickets-layout";

export default async function MyTicketsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <UserTicketsLayout user={session.user}>
      <UserTickets user={session.user} />
    </UserTicketsLayout>
  );
}
