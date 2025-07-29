import { ValidationContext, ValidationResult } from "../../../command-handler/dist/types";

/**
 * Command-specific validation for hello command
 * Demonstrates developer-only access control and custom validation logic
 */
export default async function helloValidation({
  interaction,
  command,
  handler,
}: ValidationContext): Promise<ValidationResult> {
  // Check if user is a bot developer/owner
  const botOwners = ["342373072137297921"]; // Add your Discord user ID here
  const isDeveloper = botOwners.includes(interaction.user.id);

  if (!isDeveloper) {
    return {
      proceed: false,
      error: "🔒 This is a developer-only command. Only bot owners can use this command.",
      ephemeral: true,
    };
  }

  // Additional demo validation: Check if it's being used during "work hours"
  const currentHour = new Date().getHours();
  const isWorkHours = currentHour >= 9 && currentHour <= 17;

  if (!isWorkHours && !isDeveloper) {
    return {
      proceed: false,
      error: "⏰ This command is only available during work hours (9 AM - 5 PM UTC).",
      ephemeral: true,
    };
  }

  // Example of a successful validation
  return { proceed: true };
}
