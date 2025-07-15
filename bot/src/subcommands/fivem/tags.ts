import { CommandInteraction, GuildMember } from "discord.js";
import { tryCatch } from "../../utils/trycatch";

export default async function changeTags(tags: string | null, interaction: CommandInteraction) {
  const maxTagLength = 6;
  if (!tags) {
    return interaction.editReply("Please provide your TAW tags.");
  }
  const cleanTags = tags.replace("[", "").replace("]", "").toUpperCase();

  if (cleanTags.length > maxTagLength) {
    return interaction.editReply(`Your TAW tags cannot be longer than ${maxTagLength} characters.`);
  }
  const member = interaction.member as GuildMember;
  const memberName = member.nickname || member.user.displayName;

  // Remove ALL existing tags from the nickname instead of just the first one
  const cleanNickname =
    member.nickname?.replace(/\s*\[.*?\]/g, "").trim() || member.user.displayName;

  const { data, error } = await tryCatch(member.setNickname(`${cleanNickname} [${cleanTags}]`));
  if (error) {
    return interaction.editReply(
      `Failed to set your TAW tags. ${error.message}\nPlease set your nickname manually to the following:\n\`\`\`${cleanNickname} [${cleanTags}]\`\`\``
    );
  }
  return interaction.editReply(`Successfully set your TAW tags to: [${tags}]`);
}
