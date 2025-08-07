import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import Modmail from "../../../models/Modmail";

export const checkResolvedOptions: LegacyCommandOptions = {
  userPermissions: ["Administrator"],
  deleted: false,
};

export default async function checkResolved({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  // Find all resolved modmails that should be auto-closed
  const now = new Date();
  const resolvedModmails = await Modmail.find({
    guildId: interaction.guild!.id,
    markedResolved: true,
    isClosed: false,
  }).lean();

  if (resolvedModmails.length === 0) {
    return await interaction.editReply({
      embeds: [
        ModmailEmbeds.success(
          client,
          "No Resolved Tickets",
          "No resolved tickets found that need auto-closing."
        ),
      ],
    });
  }

  let description = `Found ${resolvedModmails.length} resolved ticket(s):\n\n`;

  for (const modmail of resolvedModmails) {
    const resolvedAt = modmail.resolvedAt ? new Date(modmail.resolvedAt) : new Date();
    const hoursSinceResolved = (now.getTime() - resolvedAt.getTime()) / (1000 * 60 * 60);
    const scheduledClose = modmail.autoCloseScheduledAt
      ? new Date(modmail.autoCloseScheduledAt)
      : null;

    // Check for user activity after resolution
    const userActivityAfterResolution =
      modmail.messages?.some((msg) => {
        const messageTime = new Date(msg.createdAt);
        return messageTime > resolvedAt && msg.type === "user";
      }) || false;

    const lastUserActivityTime = new Date(modmail.lastUserActivityAt || now);
    const userActivityTimeAfterResolution = lastUserActivityTime > resolvedAt;
    const hasUserActivityAfterResolution =
      userActivityAfterResolution || userActivityTimeAfterResolution;

    description += `**Ticket #${modmail.ticketNumber}**\n`;
    description += `• Resolved: ${hoursSinceResolved.toFixed(1)}h ago\n`;
    description += `• Scheduled close: ${
      scheduledClose
        ? now > scheduledClose
          ? `${((now.getTime() - scheduledClose.getTime()) / (1000 * 60 * 60)).toFixed(1)}h overdue`
          : `in ${((scheduledClose.getTime() - now.getTime()) / (1000 * 60 * 60)).toFixed(1)}h`
        : "Not set"
    }\n`;
    description += `• User activity after resolution: ${
      hasUserActivityAfterResolution ? "❌ Yes (blocks auto-close)" : "✅ No"
    }\n`;
    description += `• Status: ${
      hasUserActivityAfterResolution
        ? "🔒 Blocked (user activity)"
        : hoursSinceResolved >= 24
        ? "⚠️ Should be closed"
        : "⏳ Waiting"
    }\n\n`;
  }

  return await interaction.editReply({
    embeds: [ModmailEmbeds.info(client, "Resolved Tickets Status", description)],
  });
}
