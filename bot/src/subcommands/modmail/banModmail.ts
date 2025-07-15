import type { SlashCommandProps, CommandOptions } from "commandkit";
import { EmbedField, SlashCommandBuilder } from "discord.js";
import { getDiscordDate, ThingGetter, TimeType } from "../../utils/TinyUtils";
import { tryCatch, tryCatchSync } from "../../utils/trycatch";
import ms from "ms";
import { waitingEmoji } from "../../Bot";
import log from "../../utils/log";
import ModmailBanModel, { BanDisplayType, ModmailBanType } from "../../models/ModmailBans";
import Database from "../../utils/data/database";
import BasicEmbed from "../../utils/BasicEmbed";
import { initialReply } from "../../utils/initialReply";

export const banModmailOptions: CommandOptions = {
  devOnly: true,
  deleted: true,
  userPermissions: ["ManageMessages", "KickMembers", "BanMembers"], // This is a mod command
};

export default async function ({ interaction, client, handler }: SlashCommandProps) {
  const guild = interaction.guild;
  const user = interaction.options.getUser("user");
  const durationString = interaction.options.getString("duration");
  const isPermanent = interaction.options.getBoolean("permanent") || false;
  const reason = interaction.options.getString("reason");
  const getter = new ThingGetter(client);
  await initialReply(interaction, true);

  if (!interaction.guild) {
    return interaction.editReply("This command can only be used in a server");
  }

  if (!user || (!durationString && !isPermanent) || !guild || !reason) {
    const missingArgs: string[] = [];
    if (!user) missingArgs.push("user");
    if (!durationString && !isPermanent) missingArgs.push("duration or permanent");
    if (!reason) missingArgs.push("reason");
    return interaction.editReply(`Missing required arguments: ${missingArgs.join(", ")}`);
  }

  const member = await getter.getMember(guild, user.id);
  if (!member) return interaction.editReply("User is not in the server");

  const db = new Database();
  const { data: existing, error: findError } = await tryCatch(
    db.findOne(ModmailBanModel, { userId: user.id })
  );
  if (findError) {
    log.error({ location: "modmailban.ts", error: findError });
    return interaction.editReply("An error occurred while checking if the user is already banned");
  }

  const { data: duration, error } = tryCatchSync(() => {
    if (isPermanent) return -1;
    if (!durationString) throw new Error("No duration provided and not permanent");
    const parsed = ms(durationString);
    if (!parsed || isNaN(parsed)) throw new Error("Invalid duration");
    return parsed;
  });
  if (error) {
    log.warn({ location: "modmailban.ts", error });
    return interaction.editReply("Invalid duration must be in the format of 1d, 1w, 1m");
  }

  const expiresAt = new Date(Date.now() + duration);
  const modmailBan: ModmailBanType = {
    guildId: guild.id,
    userId: user.id,
    bannedBy: interaction.user.id,
    reason,
    duration: duration === -1 ? undefined : duration,
    permanent: isPermanent,
    expiresAt: duration === -1 ? undefined : expiresAt,
    bannedAt: new Date(),
  };

  const responseLines = [
    `Banned ${user.tag} from using modmail`,
    `Reason: ${reason}`,
    `Duration: ${isPermanent ? "Permanent" : durationString}`,
  ];

  const embedFields: EmbedField[] = [];

  if (existing) {
    // Prepare ban history array (start with previous bans or empty array)
    const banHistory = existing.previousBans || [];

    // Add the current ban to history (excluding its own previousBans field to avoid nesting)
    const existingBanForHistory = { ...existing };
    delete existingBanForHistory.previousBans;
    banHistory.push(existingBanForHistory);

    // Set the accumulated history on the new ban
    modmailBan.previousBans = banHistory;

    // Update in database
    await tryCatch(db.findOneAndUpdate(ModmailBanModel, { userId: user.id }, modmailBan));
    responseLines.push(`Previous bans: ${banHistory.length}`);

    // Add all previous bans to embed fields
    banHistory.forEach((ban) => {
      embedFields.push(getBanMessageField(ban));
    });
  } else {
    // No existing ban
    await tryCatch(db.findOneAndUpdate(ModmailBanModel, modmailBan, { upsert: true, new: true }));
  }

  if (embedFields.length > 20) {
    const diff = embedFields.length - 19;
    embedFields.splice(20, diff, {
      name: `And ${diff} more...`,
      value: "Check the database for more information",
      inline: false,
    });

    responseLines.push(`And ${diff} more bans`);
  }

  const dmChannel = await user.createDM();
  const { data: _, error: dmError } = await tryCatch(
    dmChannel.send(
      `You have been banned from using modmail in ${
        guild.name
      } for the following reason: ${reason}${
        isPermanent
          ? " (Permanent)"
          : ` (Expires: ${getDiscordDate(expiresAt, TimeType.FULL_LONG)})`
      }`
    )
  );

  if (dmError) {
    log.warn({ location: "modmailban.ts", error: dmError });
    responseLines.push("Failed to send a DM notification to the user, they may have DMs disabled");
  }

  await interaction.editReply({
    embeds: [BasicEmbed(client, "Modmail Bans", responseLines.join(`\n`), embedFields)],
    content: "",
    allowedMentions: { parse: [] },
  });
}

function getBanMessageField(ban: BanDisplayType, firstBan?: boolean, inline?: boolean): EmbedField {
  return {
    name: firstBan
      ? `Ban on ${getDiscordDate(ban.bannedAt, TimeType.DATE)} (This ban)`
      : `Ban on ${getDiscordDate(ban.bannedAt, TimeType.DATE)}`,
    value: `Reason: ${ban.reason}\n${
      (ban.permanent
        ? "Permanent"
        : `Expires: ${getDiscordDate(ban.expiresAt!, TimeType.FULL_LONG)} (${getDiscordDate(
            ban.expiresAt!,
            TimeType.RELATIVE
          )})`) + `\nBanned by: <@${ban.bannedBy}>`
    }`,
    inline: inline || false,
  };
}
