import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import log from "../../../utils/log";
import { modmailScheduler } from "../../../events/ready/loggedIn";

export const runSchedulerOptions: LegacyCommandOptions = {
  userPermissions: ["Administrator"],
  deleted: false,
};

export default async function runScheduler({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  log.info(
    `Manual modmail scheduler run triggered by ${interaction.user.tag} in guild ${interaction.guild?.name}`
  );

  if (!modmailScheduler) {
    return await interaction.editReply({
      embeds: [ModmailEmbeds.error(client, "Error", "Modmail scheduler is not initialized")],
    });
  }

  try {
    await modmailScheduler.getInactivityService().checkInactiveModmails();

    return await interaction.editReply({
      embeds: [
        ModmailEmbeds.success(
          client,
          "Scheduler Run Complete",
          "Modmail inactivity check has been run manually. Check the logs for details."
        ),
      ],
    });
  } catch (error) {
    log.error("Error during manual scheduler run:", error);
    return await interaction.editReply({
      embeds: [ModmailEmbeds.error(client, "Scheduler Error", `Failed to run scheduler: ${error}`)],
    });
  }
}
