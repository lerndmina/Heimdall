import { Client, GuildMember } from "discord.js";
import Database from "../../utils/data/database";
import WelcomeMessage from "../../models/WelcomeMessage";
import { SendWelcomeMessage } from "../../commands/utilities/welcome";
import log from "../../utils/log";

export default async (member: GuildMember, client: Client<true>): Promise<boolean | void> => {
  try {
    const db = new Database();
    const guildId = member.guild.id;

    // Fetch the welcome message configuration for this guild
    const welcomeConfig = await db.findOne(WelcomeMessage, { guildId }, true);

    if (!welcomeConfig) {
      log.debug(`No welcome message configured for guild ${guildId}`);
      return false;
    }

    // Send the welcome message
    const result = await SendWelcomeMessage(welcomeConfig, client, member.id);

    if (result.success) {
      log.info(
        `Welcome message sent for user ${member.user.username} in guild ${member.guild.name}`
      );
    } else {
      log.error(`Failed to send welcome message: ${result.data}`);
    }

    return result.success;
  } catch (error) {
    log.error("Error in welcome event:", error);
    return false;
  }
};
