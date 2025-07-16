import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TranscriptsHome } from "@/components/dashboard/transcripts-home";

export default async function TranscriptsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <TranscriptsHome />;
}
