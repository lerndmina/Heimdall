import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TranscriptViewer } from "@/components/transcript/transcript-viewer";

interface TranscriptPageProps {
  params: {
    guildId: string;
    threadId: string;
  };
}

export default async function TranscriptPage({ params }: TranscriptPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
      <div className="container mx-auto px-4 py-8">
        <TranscriptViewer guildId={params.guildId} threadId={params.threadId} user={session.user} />
      </div>
    </div>
  );
}
