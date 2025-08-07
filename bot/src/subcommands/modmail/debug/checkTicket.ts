import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import Modmail from "../../../models/Modmail";
import Database from "../../../utils/data/database";

export const checkTicketOptions: LegacyCommandOptions = {
  userPermissions: ["Administrator"],
  deleted: false,
};

export default async function checkTicket({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  const ticketNumber = interaction.options.getInteger("ticket-number", true);
  const db = new Database();

  const modmail = await db.findOne(Modmail, {
    guildId: interaction.guild!.id,
    ticketNumber: ticketNumber,
  });

  if (!modmail) {
    return await interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Ticket Not Found",
          `No ticket found with number ${ticketNumber}`
        ),
      ],
    });
  }

  const now = new Date();
  let description = `**Ticket #${modmail.ticketNumber}**\n\n`;
  description += `• **Status**: ${modmail.isClosed ? "Closed" : "Open"}\n`;
  description += `• **Marked Resolved**: ${modmail.markedResolved ? "Yes" : "No"}\n`;

  if (modmail.resolvedAt) {
    const resolvedAt = new Date(modmail.resolvedAt);
    const hoursSinceResolved = (now.getTime() - resolvedAt.getTime()) / (1000 * 60 * 60);
    description += `• **Resolved At**: ${resolvedAt.toISOString()}\n`;
    description += `• **Hours Since Resolved**: ${hoursSinceResolved.toFixed(2)}\n`;

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

    description += `• **User Activity After Resolution**: ${
      hasUserActivityAfterResolution ? "❌ Yes (blocks auto-close)" : "✅ No"
    }\n`;

    if (userActivityAfterResolution) {
      const userMessagesAfterResolution =
        modmail.messages?.filter((msg) => {
          const messageTime = new Date(msg.createdAt);
          return messageTime > resolvedAt && msg.type === "user";
        }) || [];
      description += `• **User Messages After Resolution**: ${userMessagesAfterResolution.length}\n`;
    }
  }

  if (modmail.autoCloseScheduledAt) {
    const scheduledTime = new Date(modmail.autoCloseScheduledAt);
    const isOverdue = now > scheduledTime;
    const hoursDiff = Math.abs(now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60);
    description += `• **Scheduled Auto-Close**: ${scheduledTime.toISOString()}\n`;
    description += `• **Auto-Close Status**: ${
      isOverdue ? `⚠️ ${hoursDiff.toFixed(2)}h overdue` : `⏳ ${hoursDiff.toFixed(2)}h remaining`
    }\n`;
  } else {
    description += `• **Scheduled Auto-Close**: Not set\n`;
  }

  description += `• **Auto-Close Disabled**: ${modmail.autoCloseDisabled ? "Yes" : "No"}\n`;

  if (modmail.lastUserActivityAt) {
    description += `• **Last User Activity**: ${new Date(
      modmail.lastUserActivityAt
    ).toISOString()}\n`;
  }

  return await interaction.editReply({
    embeds: [ModmailEmbeds.info(client, "Ticket Debug Info", description)],
  });
}
