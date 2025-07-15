import {
  SlashCommandBuilder,
  Client,
  Snowflake,
  Guild,
  StringSelectMenuInteraction,
  MessageComponentInteraction,
  CacheType,
} from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { ThingGetter } from "../../utils/TinyUtils";
import { StringSelectMenuBuilder, ActionRowBuilder } from "discord.js";
import { SlashCommandProps } from "commandkit";
import log from "../../utils/log";

export const data = new SlashCommandBuilder()
  .setName("sharedguilds")
  .setDescription("List the guilds you share with the bot.");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const getter = new ThingGetter(client);
  //code to fetch mutual servers
  const guilds: Guild[] = [];
  for (const [, guild] of client.guilds.cache) {
    await guild.members
      .fetch(interaction.user)
      .then(() => guilds.push(guild))
      .catch((error) => log.info(error));
  }

  //code to generate array of server names & IDs for .addOption() in select menu component
  const servers: { label: string; value: string }[] = [];
  for (let i = 0; i < Object.keys(guilds).length; i++) {
    servers.push({
      label: Object.entries(guilds)[i][1].name,
      value: Object.entries(guilds)[i][1].id,
    });
  }

  const serverMenu = new StringSelectMenuBuilder()
    .setCustomId("serverMenu")
    .setPlaceholder("Select a server")
    .setMinValues(1)
    .setMaxValues(1);

  serverMenu.addOptions(servers);

  const row1 = new ActionRowBuilder().addComponents(serverMenu);

  const response = await interaction.reply({
    embeds: [
      BasicEmbed(
        interaction.client,
        "Shared Guilds",
        `Select a server to view the guild's information.`
      ),
    ],
    components: [row1 as any],
    ephemeral: true,
  });

  const collectorFilter = (i: MessageComponentInteraction) => i.user.id === interaction.user.id;

  try {
    const interactionResponse = await response.awaitMessageComponent({
      filter: collectorFilter,
      time: 60000,
    });

    const i = interactionResponse as StringSelectMenuInteraction;

    /**
     * @type {import("discord.js").Guild}
     */
    const guild = await getter.getGuild(i.values[0]);

    if (!guild) throw new Error("Guild not found.");

    log.info(guild.name);

    /**
     * @type {import("discord.js").MessageEmbed}
     */
    const guildEmbed = BasicEmbed(interaction.client, `Viewing Guild: ${guild.name}`, `*`, [
      { name: "ID", value: `\`${guild.id}\``, inline: false },
      { name: "Members", value: `\`${guild.memberCount}\``, inline: false },
      {
        name: "Created",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
        inline: false,
      },
    ]);

    await interaction.editReply({
      embeds: [guildEmbed],
      components: [],
    });
  } catch (e) {
    log.error(e as string);
    await interaction.editReply({
      content: `No response was given in time or an error occured.\n\n\`\`\`${e}\`\`\``,
      components: [],
    });
  }
}
