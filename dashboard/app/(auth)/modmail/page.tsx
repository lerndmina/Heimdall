import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ModmailHome } from "@/components/dashboard/modmail-home";

export default async function ModmailPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <ModmailHome />;
}
