import { ValidationContext, ValidationResult } from "../../../command-handler/dist/types";
import { PermissionFlagsBits } from "discord.js";

/**
 * Command-specific validation for modmail commands
 * Ensures proper permissions and setup before modmail commands can be used
 */
export default async function modmailValidation({
  interaction,
  command,
  handler,
}: ValidationContext): Promise<ValidationResult> {
  // Only apply to guild interactions
  if (!interaction.guildId || !interaction.guild) {
    return {
      proceed: false,
      error: "❌ Modmail commands can only be used in servers.",
      ephemeral: true,
    };
  }

  // Check if user has manage guild permission for modmail setup/config commands
  const setupCommands = ["modmail"]; // Add subcommand names that require special permissions

  if (setupCommands.includes(command.name)) {
    const member = interaction.guild.members.cache.get(interaction.user.id);

    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return {
        proceed: false,
        error: "❌ You need the `Manage Server` permission to use modmail setup commands.",
        ephemeral: true,
      };
    }
  }

  // You could add additional checks here like:
  // - Verify modmail is configured for this guild
  // - Check if user has staff role for certain modmail commands
  // - Validate rate limits specific to modmail operations

  return { proceed: true };
}
