import { Client, GuildMember } from "discord.js";
import MinecraftLeaveService from "../../services/MinecraftLeaveService";
import log from "../../utils/log";

export default async (member: GuildMember, client: Client<true>): Promise<boolean | void> => {
  try {
    const guildId = member.guild.id;
    const discordId = member.user.id;

    log.debug("Processing guild member add for potential Minecraft auto-whitelist", {
      guildId,
      discordId,
      username: member.user.username,
      guildName: member.guild.name,
    });

    // Process auto-whitelist asynchronously to avoid blocking the event
    MinecraftLeaveService.autoWhitelistOnRejoin(guildId, discordId).catch((error) => {
      log.error("Async auto-whitelist processing failed", {
        guildId,
        discordId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    log.error("Failed to handle guild member add for auto-whitelist", {
      guildId: member.guild.id,
      discordId: member.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
