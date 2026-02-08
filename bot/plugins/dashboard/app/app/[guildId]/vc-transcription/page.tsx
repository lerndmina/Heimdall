/**
 * VC Transcription page — manage voice message transcription settings.
 */
"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import VCTranscriptionConfigPage from "./VCTranscriptionPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="vc-transcription">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Transcription</h1>
          <p className="text-zinc-400">
            Configure automatic transcription of Discord voice messages using local Whisper or OpenAI&apos;s API.
          </p>
        </div>
        <VCTranscriptionConfigPage guildId={guildId} />
      </div>
    </PermissionGate>
  );
}
