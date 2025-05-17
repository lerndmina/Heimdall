import {
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageComponentInteraction,
  User,
} from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import {
  getCharacterInfo,
  parseActivityData,
  formatTimestamp,
  TawMemberFetchResponse,
} from "./commons";
import Database from "../../utils/data/database";
import FetchEnvs from "../../utils/FetchEnvs";
import { tryCatch, tryCatchSync } from "../../utils/trycatch";
import TawLinks from "../../models/TawLinks";
import ButtonWrapper from "../../utils/ButtonWrapper";
import { sleep } from "../../utils/TinyUtils";
import { initialReply } from "../../utils/initialReply";
import log from "../../utils/log";
const db = new Database();
const env = FetchEnvs();
/*
 * This function handles the linking of a TAW user to a Discord user.
 * It checks if the member is an admin or if they are trying to link their own account.
 * If the member is not an admin and is not linking their own account, it sends an error message.
 * If the member is an admin, it proceeds with the linking process.
 *
 * Then check if the member has already linked their account.
 * If they have, it sends an error message.
 *
 * If they haven't, it proceeds with the linking process.
 * Send a reply with a link code to the user.
 * The user must then go to the TAW website and enter the code on their bio page.
 *
 * Once the user has entered the code, they can click a button to confirm the linking.
 * The bot will then check if the code is valid and if the user has entered it correctly.
 * If the code is valid, it will link the TAW account to the Discord account.
 *
 */

export default async function tawLink(
  interaction: CommandInteraction,
  tawUser: string | null,
  discordUser: User | null,
  apiKey: string,
  apiUrlString: string
) {
  const member = interaction.member;
  const tawUserToLink = (tawUser || interaction.user.username).toLowerCase().trim();

  discordUser = discordUser || interaction.user;
  if (!member || !discordUser) {
    await interaction.editReply("Member or Discord user not found.");
    return;
  }

  if (!interaction.channel) {
    await interaction.editReply("This command can only be used in a channel.");
    return;
  }

  if (member.user.id !== discordUser.id) {
    const memberIsAdmin =
      interaction.memberPermissions?.has("Administrator") ||
      interaction.memberPermissions?.has("ManageGuild");
    if (!memberIsAdmin) {
      await interaction.editReply("You do not have permission to link this account.");
      return;
    } else {
      // ! Admin flow, no need to verify the user
      await interaction.editReply(
        `You are linking the TAW account for ${discordUser.username} (${discordUser.id})`
      );

      await db.findOneAndUpdate(
        TawLinks,
        { discordUserId: discordUser.id },
        { tawUserCallsign: tawUserToLink, fullyLinked: true },
        { upsert: true, new: true }
      );

      await interaction.editReply(
        `Successfully linked the TAW account for ${discordUser.username} (${discordUser.id})`
      );
      return;
    }
  }

  const { data: apiUrl, error: urlError } = tryCatchSync(() => new URL(apiUrlString));
  if (urlError) {
    await interaction.editReply(
      "Invalid API URL. This is a bug. Please report it to the developers."
    );
    return;
  }

  let tawLinkData = await db.findOne(TawLinks, { discordUserId: member.user.id });
  if (tawLinkData && tawLinkData.fullyLinked) {
    // Check if the user has already linked their account
    await interaction.editReply(
      `You have already linked your TAW account to your Discord account. If you want to unlink it, please DM me to contact an admin\n\nTAW Callsign: ${tawLinkData.tawUserCallsign}`
    );
    return;
  }

  if (!tawLinkData || hasCodeExpired(tawLinkData.codeExpiresAt)) {
    // If the code has not been generated yet, or if it has expired, generate a new one

    if (tawLinkData && hasCodeExpired(tawLinkData.codeExpiresAt)) {
      interaction.editReply("Your previous code has expired. Generating a new one...");
      tawLinkData.linkCode = generateCode().toString();
      tawLinkData.codeExpiresAt = getExpirationDate();

      await sleep(2000);
    } else {
      tawLinkData = new TawLinks({
        discordUserId: member.user.id,
        tawUserCallsign: tawUserToLink,
        linkCode: generateCode().toString(),
        codeExpiresAt: getExpirationDate(),
      });

      await db.findOneAndUpdate(TawLinks, { discordUserId: member.user.id }, tawLinkData, {
        upsert: true,
        new: true,
      });
    }
  }

  if (!tawLinkData) {
    // If after the update tawLinkData is still null, it means there was a database error
    await interaction.editReply(
      "Failed to link TAW account. A backend database error occurred. Please report this to the developers."
    );
    return;
  }

  tawLinkData.tawUserCallsign = tawUserToLink; // Update the tawUserCallsign to the one provided by the user, this fixes any spelling errors they might've made previously

  const embed = BasicEmbed(
    interaction.client,
    "Linking TAW Account",
    `Please go to your [TAW Profile](https://taw.net/user/EditProfile.aspx) and enter the code below in your bio section. Click save. Then click the button below to confirm the linking process.\n\nBe aware that this code is valid for 5 minutes only. If you do not confirm the linking process within that time, the code will expire and you will need to generate a new one.`
  );

  embed.addFields({
    name: "Link Code",
    value: `\`\`\`${tawLinkData.linkCode}\`\`\``,
    inline: true,
  });

  const buttons = ButtonWrapper([
    new ButtonBuilder()
      .setCustomId("taw-link-confirm_" + tawLinkData.linkCode)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Primary),
  ]);

  await interaction.editReply({
    embeds: [embed],
    components: buttons,
    content: "",
  });

  const collectorFilter = (i: MessageComponentInteraction) => i.user.id === member.user.id;
  const collector = interaction.channel.createMessageComponentCollector({
    filter: collectorFilter,
    time: 5 * 60 * 1000, // 5 minutes
  });

  collector.on("collect", async (i: MessageComponentInteraction) => {
    if (i.customId === "taw-link-confirm_" + tawLinkData.linkCode) {
      await i.deferUpdate();
      await interaction.editReply({
        content: "Looking up your account " + env.WAITING_EMOJI,
        embeds: [],
        components: [],
      });

      const url = new URL(apiUrl + "member");
      url.searchParams.append("username", tawUserToLink);
      url.searchParams.append("apiKey", apiKey);

      const { data: response, error: responseError } = await tryCatch(
        fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })
      );
      if (responseError) {
        await interaction.editReply({
          content:
            "Failed to link TAW account. A backend error occurred. Please report this to the developers.",
          embeds: [],
          components: [],
        });
        log.error(`Failed to link TAW account. Error: ${responseError}`, responseError);
        return;
      }
      if (!response.ok && response.status !== 404) {
        await interaction.editReply({
          content:
            "Failed to link TAW account. A backend error occurred. Please report this to the developers.",
          embeds: [],
          components: [],
        });
        log.error(`Failed to link TAW account. Error: ${response.statusText}`, response);
        return;
      }

      if (response.status === 404) {
        await interaction.editReply({
          content: "TAW account not found. Please check the username and try again.",
          embeds: [],
          components: [],
        });
        log.debug(
          `TAW account not found. Username: ${tawUserToLink}, Discord ID: ${member.user.id}`,
          tawLinkData,
          tawUserToLink,
          response,
          url
        );
        return;
      }

      const { data: tawUserDataJson, error: tawUserDataParseError } = await tryCatch(
        response.json()
      );
      if (tawUserDataParseError) {
        await interaction.editReply({
          content:
            "Failed to link TAW account. A backend error occurred. Please report this to the developers.",
          embeds: [],
          components: [],
        });
        log.error(
          `Failed to parse TAW user data. Error: ${tawUserDataParseError}`,
          tawUserDataParseError
        );
        return;
      }

      const tawResponse = tawUserDataJson as TawMemberFetchResponse;
      const userData = tawResponse.memberData;

      tawLinkData.fullyLinked = true;
      tawLinkData.tawUserCallsign = userData.callsign;

      await db.findOneAndUpdate(
        TawLinks,
        { discordUserId: tawLinkData.discordUserId },
        tawLinkData,
        { upsert: true, new: false }
      );

      const embed = BasicEmbed(
        interaction.client,
        "Linking TAW Account",
        `Successfully linked your TAW account to your Discord account.\n\nPlease note that this process is irreversible. If you want to unlink your account, please contact an admin.\n\nYou can now remove the code from your TAW profile bio if you want to.`
      ).addFields(
        { name: "TAW Callsign", value: userData.callsign, inline: true },
        { name: "Discord Username", value: member.user.username, inline: true },
        {
          name: "TAW Profile",
          value: `https://taw.net/member/${userData.callsign}.aspx`,
          inline: true,
        }
      );

      if (userData.rank) embed.addFields({ name: "Rank", value: userData.rank, inline: true });
      if (userData.rankDuration)
        embed.addFields({ name: "Time In Rank", value: userData.rankDuration, inline: true });
      if (userData.timeInTaw)
        embed.addFields({ name: "Time in TAW", value: userData.timeInTaw, inline: true });

      if (userData.units)
        embed.addFields({
          name: "Units",
          value: userData.units.map((unit) => unit).join(", "),
          inline: true,
        });

      await interaction.editReply({
        content: "Successfully linked your TAW account to your Discord account.",
        embeds: [embed],
        components: [],
      });
    }
  });
  collector.on("end", async () => {
    await interaction.editReply({
      content: "The link process has timed out. Please try again.",
      embeds: [],
      components: [],
    });
  });
}

function generateCode() {
  return Math.floor(100_000_000 + Math.random() * 900_000_000).toString();
}

function getExpirationDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5); // Add 5 minutes
  return now;
}

function hasCodeExpired(codeExpiresAt: Date | null | undefined) {
  if (!codeExpiresAt) {
    return true; // If no expiration date is set, consider it expired
  }
  const now = new Date();
  return now > codeExpiresAt;
}
