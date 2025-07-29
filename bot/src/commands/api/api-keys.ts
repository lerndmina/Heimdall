import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Snowflake,
  EmbedField,
  MessageComponentInteraction,
} from "discord.js";
import { createSignal, createEffect, ButtonKit } from "@heimdall/command-handler";
import { createApiKey, listApiKeys, revokeApiKey } from "../../utils/api/apiKeyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";

const env = FetchEnvs();

// Pagination configuration
const KEYS_PER_PAGE = 5;

function getButtons(interactionId: Snowflake) {
  // Decrement button
  const dec = new ButtonKit()
    .setEmoji("⬅️")
    .setStyle(ButtonStyle.Primary)
    .setCustomId("decrement-" + interactionId);

  // Increment button
  const inc = new ButtonKit()
    .setEmoji("➡️")
    .setStyle(ButtonStyle.Primary)
    .setCustomId("increment-" + interactionId);

  // Disposal button
  const trash = new ButtonKit()
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger)
    .setCustomId("trash-" + interactionId);

  // Create an action row
  const row = new ActionRowBuilder<ButtonKit>().addComponents(dec, inc, trash);

  return { dec, inc, trash, row };
}

function isCountInBounds(count: number, change: number, maxPages: number) {
  const min = 0;
  const max = maxPages - 1;
  return count + change >= min && count + change <= max;
}

function formatApiKeyForEmbed(key: any, index: number) {
  // Handle date conversion safely
  const createdAt = key.createdAt instanceof Date ? key.createdAt : new Date(key.createdAt);
  const lastUsed = key.lastUsed
    ? key.lastUsed instanceof Date
      ? key.lastUsed
      : new Date(key.lastUsed)
    : null;
  const expiresAt = key.expiresAt
    ? key.expiresAt instanceof Date
      ? key.expiresAt
      : new Date(key.expiresAt)
    : null;

  const lastUsedText = lastUsed ? `<t:${Math.floor(lastUsed.getTime() / 1000)}:R>` : "Never";

  const expiresText = expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` : "Never";

  return {
    name: `${index + 1}. ${key.name}`,
    value: [
      `**Key ID:** \`${key.keyId}\``,
      `**Scopes:** ${key.scopes.join(", ")}`,
      `**Created:** <t:${Math.floor(createdAt.getTime() / 1000)}:R>`,
      `**Last Used:** ${lastUsedText}`,
      `**Expires:** ${expiresText}`,
    ].join("\n"),
    inline: false,
  };
}

export const data = new SlashCommandBuilder()
  .setName("api-keys")
  .setDescription("Manage API keys for the Heimdall API")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("generate")
      .setDescription("Generate a new API key")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("A descriptive name for this API key")
          .setRequired(true)
          .setMaxLength(50)
      )
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("The scope for this API key")
          .setRequired(true)
          .setChoices(
            { name: "Modmail Read Only", value: "modmail:read" },
            { name: "Modmail Read & Write", value: "modmail:write" },
            { name: "Modmail Admin", value: "modmail:admin" },
            { name: "Full Access", value: "full" }
          )
      )
      .addIntegerOption((option) =>
        option
          .setName("expires-days")
          .setDescription("Number of days until the key expires (optional)")
          .setMinValue(1)
          .setMaxValue(365)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List all your active API keys")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("revoke")
      .setDescription("Revoke an API key")
      .addStringOption((option) =>
        option.setName("key-id").setDescription("The key ID to revoke").setRequired(true)
      )
  )
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: true,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "generate":
      await handleGenerate(interaction, client);
      break;
    case "list":
      await handleList(interaction, client);
      break;
    case "revoke":
      await handleRevoke(interaction, client);
      break;
    default:
      await interaction.reply({
        embeds: [BasicEmbed(client, "Error", "Unknown subcommand", undefined, "Red")],
        ephemeral: true,
      });
  }
}

async function handleGenerate(interaction: any, client: any) {
  const name = interaction.options.getString("name", true);
  const scope = interaction.options.getString("scope", true);
  const expiresDays = interaction.options.getInteger("expires-days");

  await interaction.deferReply({ ephemeral: true });

  try {
    // Calculate expiration date if provided
    let expiresAt: Date | undefined;
    if (expiresDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresDays);
    }

    const result = await createApiKey(name, [scope], interaction.user.id, expiresAt);

    if (!result.success) {
      return interaction.editReply({
        embeds: [BasicEmbed(client, "Error", result.error!, undefined, "Red")],
      });
    }

    // Create a success embed with the API key (shown only once)
    const embed = new EmbedBuilder()
      .setTitle("🔑 API Key Generated")
      .setDescription(
        "Your API key has been generated successfully. **Save it now** - it won't be shown again!"
      )
      .addFields(
        { name: "Key ID", value: `\`${result.keyId}\``, inline: true },
        { name: "Name", value: name, inline: true },
        { name: "Scope", value: scope, inline: true },
        { name: "API Key", value: `\`\`\`${result.apiKey}\`\`\``, inline: false }
      )
      .setColor("Green")
      .setTimestamp()
      .setFooter({ text: "Heimdall API", iconURL: client.user.displayAvatarURL() });

    if (expiresAt) {
      embed.addFields({
        name: "Expires",
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
        inline: true,
      });
    }

    await interaction.editReply({
      embeds: [embed],
    });

    log.info(
      `API key generated: ${result.keyId} by ${interaction.user.tag} (${interaction.user.id})`
    );
  } catch (error) {
    log.error("Error generating API key:", error);
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Error",
          "An error occurred while generating the API key",
          undefined,
          "Red"
        ),
      ],
    });
  }
}

async function handleList(interaction: any, client: any) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const keys = await listApiKeys(interaction.user.id);

    if (keys.length === 0) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "No API Keys",
            "You don't have any API keys yet. Use `/api-keys generate` to create one.",
            undefined,
            "Orange"
          ),
        ],
      });
    }

    // Split keys into pages
    const pages: EmbedField[][] = [];
    for (let i = 0; i < keys.length; i += KEYS_PER_PAGE) {
      const pageKeys = keys.slice(i, i + KEYS_PER_PAGE);
      const pageFields = pageKeys.map((key, index) => formatApiKeyForEmbed(key, i + index));
      pages.push(pageFields);
    }

    // If only one page, show without pagination
    if (pages.length === 1) {
      const embed = new EmbedBuilder()
        .setTitle("🔑 Your API Keys")
        .setDescription(`Found ${keys.length} API key${keys.length > 1 ? "s" : ""}`)
        .addFields(pages[0])
        .setColor("Blue")
        .setTimestamp()
        .setFooter({ text: "Heimdall API", iconURL: client.user.displayAvatarURL() });

      return interaction.editReply({
        embeds: [embed],
      });
    }

    // Multiple pages - use pagination
    const [count, setCount, disposeCountSubscribers] = createSignal(0);
    const { dec, inc, trash, row } = getButtons(interaction.id);

    let inter: MessageComponentInteraction | null = null;

    const embedTitle = "🔑 Your API Keys";
    const getEmbedDescription = (currentPage: number, totalPages: number, totalKeys: number) =>
      `Found ${totalKeys} API key${totalKeys > 1 ? "s" : ""} • Page ${
        currentPage + 1
      } of ${totalPages}`;

    // Send the initial message with the buttons
    const message = await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(getEmbedDescription(0, pages.length, keys.length))
          .addFields(pages[0])
          .setColor("Blue")
          .setTimestamp()
          .setFooter({ text: "Heimdall API", iconURL: client.user.displayAvatarURL() }),
      ],
      components: [row],
    });

    // Subscribe to count signal and update the message every time the count changes
    createEffect(() => {
      const value = count();

      inter?.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(getEmbedDescription(value, pages.length, keys.length))
            .addFields(pages[value])
            .setColor("Blue")
            .setTimestamp()
            .setFooter({ text: "Heimdall API", iconURL: client.user.displayAvatarURL() }),
        ],
      });
    });

    // Handler to decrement the count
    dec.onClick(
      (interaction) => {
        inter = interaction;
        setCount((prev) => {
          if (isCountInBounds(prev, -1, pages.length)) return prev - 1;
          return prev;
        });
      },
      { message }
    );

    // Handler to increment the count
    inc.onClick(
      (interaction) => {
        inter = interaction;
        setCount((prev) => {
          if (isCountInBounds(prev, 1, pages.length)) return prev + 1;
          return prev;
        });
      },
      { message }
    );

    // Disposal handler
    trash.onClick(
      async (interaction) => {
        const disposed = row.setComponents(
          row.components.map((button) => {
            return button.setDisabled(true);
          })
        );

        disposeCountSubscribers();

        await interaction.update({
          content: "API Keys list closed.",
          components: [disposed],
          embeds: [],
        });
      },
      { message }
    );
  } catch (error) {
    log.error("Error listing API keys:", error);
    await interaction.editReply({
      embeds: [
        BasicEmbed(client, "Error", "An error occurred while listing API keys", undefined, "Red"),
      ],
    });
  }
}

async function handleRevoke(interaction: any, client: any) {
  const keyId = interaction.options.getString("key-id", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const success = await revokeApiKey(keyId, interaction.user.id);

    if (success) {
      await interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "✅ API Key Revoked",
            `API key \`${keyId}\` has been revoked successfully.`,
            undefined,
            "Green"
          ),
        ],
      });
      log.info(`API key revoked: ${keyId} by ${interaction.user.tag} (${interaction.user.id})`);
    } else {
      await interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Error",
            `API key \`${keyId}\` not found or you don't have permission to revoke it.`,
            undefined,
            "Red"
          ),
        ],
      });
    }
  } catch (error) {
    log.error("Error revoking API key:", error);
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Error",
          "An error occurred while revoking the API key",
          undefined,
          "Red"
        ),
      ],
    });
  }
}
