import {
  ButtonInteraction,
  Client,
  GuildMember,
  InteractionType,
  MessageComponentInteraction,
} from "discord.js";
import RoleButtons from "../../models/RoleButtons";
import { log } from "console";
import { ROLE_BUTTON_PREFIX, waitingEmoji } from "../../Bot";
import Database from "../../utils/data/database";
import { debugMsg } from "../../utils/TinyUtils";
import FetchEnvs from "../../utils/FetchEnvs";
import { initialReply } from "../../utils/initialReply";
const env = FetchEnvs();

/**
 *
 * @param {MessageComponentInteraction} interaction
 * @param {Client} client
 */
export default async (interaction: MessageComponentInteraction, client: Client) => {
  var start = env.DEBUG_LOG ? Date.now() : undefined;
  if (interaction.type !== InteractionType.MessageComponent) return;
  if (!interaction.guild) return;
  if (!interaction.customId.startsWith(ROLE_BUTTON_PREFIX)) return;
  await initialReply(interaction, true);

  const parts = interaction.customId.split("-");
  const uuid = parts.slice(1).join("-");
  const db = new Database();
  const roleObj = await db.findOne(RoleButtons, { buttonId: uuid });
  if (!roleObj)
    return interaction.editReply({
      content: `This button is broken. Please contact the bot developer.\nPlease provide a screenshot of this message\n\`No Role Object Found For ${uuid}\``,
    });

  const role = interaction.guild.roles.cache.get(roleObj.roleId);
  if (!role)
    return interaction.editReply({
      content: `This button is broken. Please contact the bot developer.\nPlease provide a screenshot of this message\n\`No Role Found For ${roleObj.roleId}\``,
    });

  try {
    const member = interaction.member as GuildMember;
    if (!member) return;
    if (member.roles.cache.has(role.id)) {
      member.roles.remove(role);
      if (env.DEBUG_LOG) debugMsg(`Assign Roles - Time taken: ${Date.now() - start!}ms`);
      return interaction.editReply({
        content: `Removed <@&${role.id}> from <@${member.id}>`,
      });
    }
    member.roles.add(role);
    if (env.DEBUG_LOG) debugMsg(`Assign Roles - Time taken: ${Date.now() - start!}ms`);
    return interaction.editReply({
      content: `Added <@&${role.id}> to <@${member.id}>`,
    });
  } catch (error: any) {
    if (error.code == 50013) {
      return interaction.editReply({
        content: `I don't have permission to give you that role. Please contact the server staff. This is not an error with the bot.`,
      });
    } else {
      return interaction.editReply({
        content: `An error occurred. Please contact the bot developer.\nPlease provide a screenshot of this message\n\`${error.code}\``,
      });
    }
  }
};
