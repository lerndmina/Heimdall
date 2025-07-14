import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../../utils/api/apiKeyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";

const env = FetchEnvs();

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

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
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
            "You don't have any active API keys.",
            undefined,
            "Yellow"
          ),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🔑 Your API Keys")
      .setColor("Blue")
      .setTimestamp()
      .setFooter({ text: "Heimdall API", iconURL: client.user.displayAvatarURL() });

    keys.forEach((key, index) => {
      const lastUsedText = key.lastUsed
        ? `<t:${Math.floor(key.lastUsed.getTime() / 1000)}:R>`
        : "Never";

      const expiresText = key.expiresAt
        ? `<t:${Math.floor(key.expiresAt.getTime() / 1000)}:F>`
        : "Never";

      embed.addFields({
        name: `${index + 1}. ${key.name}`,
        value: [
          `**Key ID:** \`${key.keyId}\``,
          `**Scopes:** ${key.scopes.join(", ")}`,
          `**Created:** <t:${Math.floor(key.createdAt.getTime() / 1000)}:R>`,
          `**Last Used:** ${lastUsedText}`,
          `**Expires:** ${expiresText}`,
        ].join("\n"),
        inline: false,
      });
    });

    await interaction.editReply({
      embeds: [embed],
    });
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
