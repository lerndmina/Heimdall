import { ValidationContext, ValidationResult } from "../../../command-handler/dist/types";

/**
 * Command-specific validation that only runs before the ping command
 * This is just an example to demonstrate command-specific validations
 */
export default async function pingValidation({
  interaction,
  command,
  handler,
}: ValidationContext): Promise<ValidationResult> {
  // Example: Only allow ping command in certain channels
  const allowedChannels = [
    "1129418506690101432", // Replace with actual channel IDs
    "1129418506690101433",
  ];

  // Skip validation in DMs
  if (!interaction.guildId) {
    return { proceed: true };
  }

  // Example validation: restrict ping to certain channels
  if (interaction.channelId && !allowedChannels.includes(interaction.channelId)) {
    return {
      proceed: false,
      error: "❌ The ping command can only be used in designated bot channels.",
      ephemeral: true,
    };
  }

  // Example: Rate limit ping command more strictly
  // You could add additional rate limiting here beyond the global cooldowns

  return { proceed: true };
}
