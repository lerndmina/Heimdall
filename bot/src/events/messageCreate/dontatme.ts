import { Message, Client, ChannelType, MessageType } from "discord.js";
import Database from "../../utils/data/database";
import { ThingGetter, debugMsg, sleep } from "../../utils/TinyUtils";
import DontAtMeRole from "../../models/DontAtMeRole";
import BasicEmbed from "../../utils/BasicEmbed";
import fetchEnvs, { DEFAULT_OPTIONAL_STRING } from "../../utils/FetchEnvs";
import log from "../../utils/log";

const env = fetchEnvs();

/**
 * Handles messages that mention users with the "Don't @ Me" role
 *
 * This event handler monitors messages for mentions of users who have the "Don't @ Me"
 * role and sends a warning to the message author, with special handling for staff mentions.
 *
 * @param {Message} message - The Discord message to process
 * @param {Client} client - The Discord client instance
 * @returns {Promise<void>}
 */
export default async (message: Message, client: Client<true>): Promise<boolean | void> => {
  // Skip processing if any of these conditions are met
  if (shouldSkipProcessing(message)) return;

  const db = new Database();
  const guild = message.guild!;
  if (!guild) {
    log.error("This message was not sent in a guild, bail out");
    return false;
  }
  const getter = new ThingGetter(client);

  // Get the "Don't @ Me" role configuration
  const dontAtMeRoleConfig = await db.findOne(DontAtMeRole, { guildId: guild.id }, true);
  if (!dontAtMeRoleConfig) {
    debugMsg({
      message: "No Dont @ Me Role found for guild",
      guildId: guild.id,
      guildName: guild.name,
    });
    return false;
  }

  const dontAtMeRole = await getter.getRole(guild, dontAtMeRoleConfig.roleId);
  if (!dontAtMeRole) {
    log.info(`Don't @ Me Role is configured but not found (ID: ${dontAtMeRoleConfig.roleId})`);
    return false;
  }

  // Check if any mentioned users have the "Don't @ Me" role
  const mentionInfo = await checkMentionedUsers(message, guild, dontAtMeRole, getter);

  // If sender is immune, do nothing
  if (mentionInfo.isUserImmune) return;

  // If no one with the role was mentioned, exit
  if (!mentionInfo.doesMentionHaveRole) return;

  // Generate and send the warning message
  // We don't await because there's nothing after this
  sendWarningMessage(
    message,
    client,
    mentionInfo.isStaffMentioned,
    env.STAFF_ROLE !== DEFAULT_OPTIONAL_STRING
  );

  return true;
};

/**
 * Determines if a message should be skipped for "Don't @ Me" processing
 * @param {Message} message - The Discord message to check
 * @returns {boolean} - Whether the message should be skipped
 */
function shouldSkipProcessing(message: Message): boolean {
  if (message.author.bot) return true;
  const bailOut =
    message.mentions.users.size < 1 ||
    message.channel.type === ChannelType.DM ||
    (message.mentions.users.has(message.author.id) && message.mentions.users.size === 1) ||
    (message.type === MessageType.Reply && message.mentions.users.size === 1);
  if (bailOut) {
    debugMsg({ message: "Dontatme: Skipping message", bailOut, messageLink: message.url });
  }
  return bailOut;
}

/**
 * Checks if mentioned users have the "Don't @ Me" role and if the sender is immune
 * @param {Message} message - The Discord message to check
 * @param {Guild} guild - The Discord guild object
 * @param {Role} dontAtMeRole - The "Don't @ Me" role object
 * @param {ThingGetter} getter - The ThingGetter instance
 * @returns {Promise<{ isUserImmune: boolean; doesMentionHaveRole: boolean; isStaffMentioned: boolean }>}
 */
async function checkMentionedUsers(
  message: Message,
  guild: any,
  dontAtMeRole: any,
  getter: ThingGetter
): Promise<{ isUserImmune: boolean; doesMentionHaveRole: boolean; isStaffMentioned: boolean }> {
  let isUserImmune = false;
  let doesMentionHaveRole = false;
  let isStaffMentioned = false;

  // Get the replied user ID if this is a reply
  let repliedUserId: string = "";
  if (message.type === MessageType.Reply && message.reference?.messageId) {
    try {
      const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
      repliedUserId = repliedMessage?.author.id;
    } catch (error) {
      log.error({ message: "Error fetching replied message", error });
    }
  }

  // Get the author's member object to check for staff role
  const authorMember = await getter.getMember(guild, message.author.id);
  const isAuthorStaff = authorMember?.roles.cache.has(env.STAFF_ROLE) || false;
  const isAuthorOwner = env.OWNER_IDS.includes(message.author.id);

  // Check all mentioned users
  for (const [userId, user] of message.mentions.users) {
    // Skip the replied user if this is a reply (Discord adds them automatically)
    if (repliedUserId.length > 0 && userId === repliedUserId) {
      debugMsg({ message: "Skipping replied user", userId });
      continue;
    }

    const mentionMember = await getter.getMember(guild, userId);
    if (!mentionMember) continue;

    // Check if mentioned user has the "Don't @ Me" role
    if (dontAtMeRole.members.has(mentionMember.id)) {
      doesMentionHaveRole = true;

      // Check if mentioned user is staff
      if (mentionMember.roles.cache.has(env.STAFF_ROLE)) {
        isStaffMentioned = true;
        debugMsg({ message: "Staff are mentioned", userId });
      }

      // Check if sender is immune
      if (isAuthorOwner || isAuthorStaff) {
        isUserImmune = true;
        debugMsg({
          message: `User is immune to dontatmerole (${isAuthorOwner ? "Owner" : "Staff"})`,
          userId: message.author.id,
        });
      }
    }
  }

  debugMsg({ message: "Does mention have role", doesMentionHaveRole });
  debugMsg({ message: "Is user immune", isUserImmune });
  debugMsg({ message: "Is staff mentioned", isStaffMentioned });

  return { isUserImmune, doesMentionHaveRole, isStaffMentioned };
}

/**
 * Sends a warning message that auto-deletes after a delay
 * @param {Message} message - The Discord message to reply to
 * @param {Client} client - The Discord client instance
 * @param {boolean} isStaffMentioned - Whether a staff member was mentioned
 * @param {boolean} hasStaffRole - Whether the guild has a staff role configured
 * @returns {Promise<void>} - Resolves an empty promise - No need to wait for completion
 */
async function sendWarningMessage(
  message: Message,
  client: Client<true>,
  isStaffMentioned: boolean,
  hasStaffRole: boolean
): Promise<void> {
  // Calculate deletion time
  const nowMs = Date.now();
  const deleteInSeconds = 60 * 5;
  const deleteTimeInFutureSeconds = Math.floor(nowMs / 1000) + deleteInSeconds;

  // Build the message text
  let replyString =
    "Hey there!\n\n" +
    "One of the users mentioned in your message have requested not to be mentioned. " +
    "Please respect their wishes and avoid mentioning them in the future.";

  // Add staff mention warning if applicable
  if (hasStaffRole && isStaffMentioned) {
    replyString +=
      "\n\n👀 Oop! Looks like you mentioned a staff member. " +
      "If you need help, please DM this bot to open a modmail ticket. Thank you!";
  }

  // Add auto-delete notice
  replyString += `\n\nThis message will be deleted <t:${deleteTimeInFutureSeconds}:R>.`;

  // Send the message
  const embed = BasicEmbed(client, "Dont @ Me", replyString);
  const sentMessage = await message.reply({
    embeds: [embed],
    allowedMentions: { repliedUser: true, parse: [] },
  });

  // Delete after the specified time
  await sleep(1000 * deleteInSeconds - 1000); // Delete one second early
  try {
    await sentMessage.delete();
  } catch (error) {
    log.error({ message: "Error deleting dont @ me message", error });
  }
}
