import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StaffTranscriptViewer } from "@/components/transcript/staff-transcript-viewer";

interface TranscriptViewPageProps {
  params: Promise<{
    guildId: string;
    threadId: string;
  }>;
}

export default async function TranscriptViewPage({ params }: TranscriptViewPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const { guildId, threadId } = await params;

  return <StaffTranscriptViewer guildId={guildId} threadId={threadId} user={session.user} />;
}
