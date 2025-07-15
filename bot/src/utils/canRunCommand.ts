import { CommandOptions, SlashCommandProps } from "commandkit";
import { ThingGetter } from "./TinyUtils";
import {
  GuildMember,
  InteractionResponse,
  PermissionResolvable,
  PermissionsString,
} from "discord.js";
import FetchEnvs from "./FetchEnvs";
import BasicEmbed from "./BasicEmbed";

const env = FetchEnvs();

enum FailReason {
  devOnly = "devOnly",
  userPermissions = "userPermissions",
  botPermissions = "botPermissions",
  guildOnly = "guildOnly",
}

function canRun(
  { interaction, client, handler }: SlashCommandProps,
  options?: CommandOptions
): { canRun: false; reason: FailReason } | { canRun: true } {
  if (!options) return { canRun: true };
  if (options.devOnly && !env.OWNER_IDS.includes(interaction.user.id))
    return { canRun: false, reason: FailReason.devOnly };
  if (options.userPermissions || options.botPermissions) {
    if (!interaction.guild) return { canRun: false, reason: FailReason.guildOnly };
  }
  if (
    options.userPermissions &&
    !checkPerms(interaction.member as GuildMember, options.userPermissions)
  )
    return { canRun: false, reason: FailReason.userPermissions };
  if (options.botPermissions) {
    const botMember = interaction.guild!.members.cache.get(client.user.id);
    if (!botMember) return { canRun: false, reason: FailReason.botPermissions };
    if (!checkPerms(botMember, options.botPermissions))
      return { canRun: false, reason: FailReason.botPermissions };
  }
  return { canRun: true };
}
export function checkPerms(member: GuildMember, perms: PermissionsString[] | PermissionsString) {
  if (!Array.isArray(perms)) perms = [perms];
  return perms.every((perm) => member.permissions.has(perm));
}

/**
 *
 * @param {SlashCommandProps} param0
 * @param {CommandOptions} options
 * @returns {Boolean} Can continue
 * @description Check if the user has the required permissions to run the command
 */

export default async function (
  { interaction, client, handler }: SlashCommandProps,
  options?: CommandOptions
): Promise<InteractionResponse<boolean> | false> {
  const data = canRun({ interaction, client, handler }, options);
  let message = "";
  if (!data.canRun) {
    switch (data.reason) {
      case FailReason.devOnly:
        message = "You must be a bot owner to run this command.";
        break;
      case FailReason.userPermissions:
        message = `You must have the following permissions to run this command: ${options?.userPermissions}`;
        break;
      case FailReason.botPermissions:
        message = `I must have the following permissions to run this command: ${options?.botPermissions}`;
        break;
      case FailReason.guildOnly:
        message = "This command can only be run in a server.";
        break;
    }
    return interaction.reply({
      embeds: [BasicEmbed(client, "‼️ Error", message, undefined, "Red")],
      ephemeral: true,
    });
  } else {
    return false;
  }
}
