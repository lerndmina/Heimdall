import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { EmbedField } from "discord.js";
import { getDiscordDate, ThingGetter, TimeType } from "../../utils/TinyUtils";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import ModmailBanModel, { BanDisplayType, ModmailBanType } from "../../models/ModmailBans";
import Database from "../../utils/data/database";
import BasicEmbed from "../../utils/BasicEmbed";
import { initialReply } from "../../utils/initialReply";

export const unbanModmailOptions: LegacyCommandOptions = {
  devOnly: true,
  deleted: true,
  userPermissions: ["ManageMessages", "KickMembers", "BanMembers"], // This is a mod command
};

export default async function ({ interaction, client, handler }: LegacySlashCommandProps) {
  const guild = interaction.guild;
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");
  const getter = new ThingGetter(client);
  await initialReply(interaction, true);

  if (!interaction.guild) {
    return interaction.editReply("This command can only be used in a server");
  }

  if (!user || !guild || !reason) {
    const missingArgs: string[] = [];
    if (!user) missingArgs.push("user");
    if (!reason) missingArgs.push("reason");
    return interaction.editReply(`Missing required arguments: ${missingArgs.join(", ")}`);
  }

  const db = new Database();
  const { data: existing, error: findError } = await tryCatch(
    db.findOne(ModmailBanModel, { userId: user.id, guildId: guild.id })
  );
  if (findError) {
    log.error({ location: "unbanModmail.ts", error: findError });
    return interaction.editReply("An error occurred while checking if the user is banned");
  }

  if (!existing) {
    return interaction.editReply(`${user.tag} is not banned from using modmail`);
  }

  if (existing.unbanned) {
    return interaction.editReply(`${user.tag} is already unbanned from using modmail`);
  }

  // Update the ban record to mark as unbanned
  const unbanData = {
    unbanned: true,
    unbannedAt: new Date(),
    unbannedBy: interaction.user.id,
    unbannedReason: reason,
  };

  const { data: updated, error: updateError } = await tryCatch(
    db.findOneAndUpdate(ModmailBanModel, { userId: user.id, guildId: guild.id }, unbanData, {
      upsert: false,
      new: true,
    })
  );

  if (updateError) {
    log.error({ location: "unbanModmail.ts", error: updateError });
    return interaction.editReply("An error occurred while unbanning the user");
  }

  const responseLines = [
    `Unbanned ${user.tag} from modmail`,
    `Reason: ${reason}`,
    `Unbanned by: ${interaction.user.tag}`,
  ];

  const embedFields: EmbedField[] = [];

  // Add information about the original ban
  if (existing) {
    embedFields.push({
      name: "Original Ban",
      value: `Reason: ${existing.reason}\nBanned by: <@${
        existing.bannedBy
      }>\nBanned on: ${getDiscordDate(existing.bannedAt, TimeType.FULL_LONG)}\n${
        existing.permanent
          ? "Type: Permanent"
          : `Expired: ${getDiscordDate(existing.expiresAt!, TimeType.FULL_LONG)}`
      }`,
      inline: false,
    });

    // Add previous bans if they exist
    if (existing.previousBans && existing.previousBans.length > 0) {
      responseLines.push(`Previous bans: ${existing.previousBans.length}`);

      // Add previous ban fields (limit to 19 to stay under Discord's 25 field limit)
      existing.previousBans.slice(0, 19).forEach((ban) => {
        embedFields.push(getBanMessageField(ban));
      });

      if (existing.previousBans.length > 19) {
        const diff = existing.previousBans.length - 19;
        embedFields.push({
          name: `And ${diff} more...`,
          value: "Check the database for more information",
          inline: false,
        });
      }
    }
  }

  // Try to send a DM to the user
  const { data: _, error: dmError } = await tryCatch(
    user.send(`You have been unbanned from using modmail in ${guild.name}. Reason: ${reason}`)
  );

  if (dmError) {
    log.warn({ location: "unbanModmail.ts", error: dmError });
    responseLines.push("Failed to send a DM notification to the user, they may have DMs disabled");
  }

  await interaction.editReply({
    embeds: [BasicEmbed(client, "Modmail Unban", responseLines.join(`\n`), embedFields)],
    content: "",
    allowedMentions: { parse: [] },
  });
}

function getBanMessageField(ban: BanDisplayType, inline?: boolean): EmbedField {
  return {
    name: `Ban on ${getDiscordDate(ban.bannedAt, TimeType.DATE)}`,
    value: `Reason: ${ban.reason}\n${
      ban.permanent
        ? "Permanent"
        : `Expires: ${getDiscordDate(ban.expiresAt!, TimeType.FULL_LONG)} (${getDiscordDate(
            ban.expiresAt!,
            TimeType.RELATIVE
          )})`
    }\nBanned by: <@${ban.bannedBy}>`,
    inline: inline || false,
  };
}
