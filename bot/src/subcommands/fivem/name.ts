import { CommandInteraction, GuildMember, User } from "discord.js";
import { sleep } from "../../utils/TinyUtils";
import { tryCatch } from "../../utils/trycatch";
import { getCharacterInfo } from "./commons";
import FetchEnvs from "../../utils/FetchEnvs";

const env = FetchEnvs();

/**
 * Sets a nickname for a member and handles any errors
 * @param preserveTags Whether to preserve any existing TAW tags
 * @returns A response message or null if successful
 */
async function setNickname(
  interaction: CommandInteraction,
  targetMember: GuildMember,
  newName: string,
  userToSet: User,
  preserveTags: boolean = true
): Promise<string | null> {
  // Clean the name from any existing tags if needed
  let cleanName = preserveTags ? newName.replace(/\[(.*?)\]$/, "").trim() : newName;

  // Preserve TAW tags if requested
  if (preserveTags) {
    const existingTags = targetMember.nickname?.match(/\[(.*?)\]$/)?.[0] || "";
    if (existingTags) {
      cleanName = `${cleanName} ${existingTags}`.trim();
    }
  }

  // Check length constraint
  if (cleanName.length > 32) {
    return `The provided name exceeds Discord's 32 character limit. Please provide a shorter name.`;
  }

  env.DEBUG_LOG && (await interaction.editReply(`Setting nickname to: ${cleanName}`));

  const { data: _, error } = await tryCatch(targetMember.setNickname(cleanName));
  if (error) {
    return `Failed to set nickname: ${error.message}. Please set your nickname manually to the following:\n\`\`\`${cleanName}\`\`\``;
  }

  return null;
}

export default async function setCharacterName(
  interaction: CommandInteraction,
  targetUser: User | null,
  name: string | undefined | null
) {
  const userToSet = targetUser || interaction.user;

  // Check if the requesting user has permission to change someone else's name
  if (targetUser && targetUser.id !== interaction.user.id) {
    // Check if the user has admin or mod permissions
    const member = interaction.member as GuildMember;
    if (!member.permissions.has("Administrator") && !member.permissions.has("ModerateMembers")) {
      return interaction.editReply("You don't have permission to change other users' names.");
    }
  }

  // Get target member
  const guild = interaction.guild;
  if (!guild) {
    return interaction.editReply("This command can only be used in a server.");
  }

  const targetMember = await guild.members.fetch(userToSet.id).catch(() => null);
  if (!targetMember) {
    return interaction.editReply(`Couldn't find the member ${userToSet.username} in this server.`);
  }

  if (name) {
    // If a name is provided, use it instead of fetching from the API
    const errorMessage = await setNickname(interaction, targetMember, name, userToSet);
    if (errorMessage) {
      return interaction.editReply(errorMessage);
    }

    return interaction.editReply(`Successfully set ${userToSet.username}'s nickname to ${name}`);
  }

  const characterInfo = await getCharacterInfo(interaction, userToSet);

  if (!characterInfo) {
    return; // Error messages already handled in getCharacterInfo
  }

  const { charInfoParsed, playerIdentifiers } = characterInfo;

  // Check if player is online - could be used for additional logic
  const isPlayerOnline = playerIdentifiers.is_online === 1;

  // Try with full name
  let newName = `${charInfoParsed.firstname} ${charInfoParsed.lastname}`;

  await interaction.editReply(
    `Attempting to set nickname to: ${newName} (with preserved tags if any)`
  );
  await sleep(3000);

  // First try with full name and tags
  let errorMessage = await setNickname(interaction, targetMember, newName, userToSet);

  // If name with tags is too long, try alternatives
  if (errorMessage?.includes("32 character limit")) {
    await interaction.editReply(
      `Full name with tags is too long. Trying with first name only... ${env.WAITING_EMOJI}`
    );
    await sleep(5000);

    // Try with first name and tags
    newName = charInfoParsed.firstname;
    errorMessage = await setNickname(interaction, targetMember, newName, userToSet);

    // If first name with tags is too long, try without tags
    if (errorMessage?.includes("32 character limit")) {
      await interaction.editReply(
        `First name with tags is still too long. Trying without tags... ${env.WAITING_EMOJI}`
      );
      await sleep(5000);

      // Try with full name without tags
      newName = `${charInfoParsed.firstname} ${charInfoParsed.lastname}`;
      errorMessage = await setNickname(interaction, targetMember, newName, userToSet, false);

      // If full name without tags is too long, try first name without tags
      if (errorMessage?.includes("32 character limit")) {
        await interaction.editReply(
          `Full name without tags is still too long. Trying first name without tags... ${env.WAITING_EMOJI}`
        );
        await sleep(5000);

        // Try with first name only, no tags
        newName = charInfoParsed.firstname;
        errorMessage = await setNickname(interaction, targetMember, newName, userToSet, false);

        if (errorMessage?.includes("32 character limit")) {
          return interaction.editReply(
            `Unable to set nickname: All name options exceed Discord's 32 character limit. ` +
              `Please contact a server administrator to set a shorter name manually.`
          );
        }
      }
    }
  }

  if (errorMessage) {
    return interaction.editReply(errorMessage);
  }

  return interaction.editReply(
    `Successfully set ${
      targetUser ? targetUser.username + "'s" : "your"
    } nickname to ${newName} (with preserved tags if applicable)`
  );
}
