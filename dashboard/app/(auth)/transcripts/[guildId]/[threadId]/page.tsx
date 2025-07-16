import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StaffTranscriptViewer } from "@/components/transcript/staff-transcript-viewer";

interface TranscriptViewPageProps {
  params: {
    guildId: string;
    threadId: string;
  };
}

export default async function TranscriptViewPage({ params }: TranscriptViewPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return <StaffTranscriptViewer guildId={params.guildId} threadId={params.threadId} user={session.user} />;
}
