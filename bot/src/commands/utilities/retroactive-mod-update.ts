import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import Database from "../../utils/data/database";
import ModerationHit, { ModerationHitStatus } from "../../models/ModerationHit";
import BasicEmbed from "../../utils/BasicEmbed";
import log from "../../utils/log";

export const data = new SlashCommandBuilder()
  .setName("retroactive-mod-update")
  .setDescription("DEV ONLY: Update database status for existing moderation reports")
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("The reports channel to scan (defaults to current channel)")
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("dry-run")
      .setDescription("Only scan and report what would be updated (default: false)")
      .setRequired(false)
  );

export const options: LegacyCommandOptions = {
  devOnly: true,
  deleted: false,
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  const channelOption = interaction.options.getChannel("channel");
  const channel = channelOption || interaction.channel;
  const dryRun = interaction.options.getBoolean("dry-run") ?? false;

  // Type guard to ensure we have a text-based channel
  if (!channel || !("messages" in channel)) {
    return interaction.reply({
      embeds: [BasicEmbed(client, "❌ Error", "Please specify a valid text channel.")],
      ephemeral: true,
    });
  }

  const textChannel = channel as TextChannel;

  await interaction.deferReply({ ephemeral: true });

  try {
    const db = new Database();
    let processedCount = 0;
    let acceptedCount = 0;
    let ignoredCount = 0;
    let alreadyUpdatedCount = 0;
    let errorCount = 0;

    // Get all messages in the channel (this might take a while for large channels)
    let lastMessageId: string | undefined;
    const allMessages: any[] = [];

    await interaction.editReply({
      embeds: [BasicEmbed(client, "🔄 Scanning", "Fetching messages from channel...")],
    });

    // Fetch messages in batches
    while (true) {
      const messages = await textChannel.messages.fetch({
        limit: 100,
        ...(lastMessageId && { before: lastMessageId }),
      });

      if (messages.size === 0) break;

      allMessages.push(...Array.from(messages.values()));
      lastMessageId = messages.last()?.id;

      // Update progress
      if (allMessages.length % 500 === 0) {
        await interaction.editReply({
          embeds: [BasicEmbed(client, "🔄 Scanning", `Fetched ${allMessages.length} messages...`)],
        });
      }
    }

    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "🔄 Processing",
          `Found ${allMessages.length} messages. Processing moderation reports...`
        ),
      ],
    });

    // Process messages to find moderation reports
    for (const message of allMessages) {
      try {
        // Skip messages without embeds
        if (!message.embeds || message.embeds.length === 0) continue;

        const embed = message.embeds[0];

        // Check if this looks like a moderation report
        // Look for specific patterns in the title or description
        const title = embed.title || "";
        const description = embed.description || "";

        // Skip if not a moderation report
        if (
          !description.includes("flagged by AI moderation") &&
          !title.includes("Report accepted") &&
          !title.includes("Report ignored")
        ) {
          continue;
        }

        // Determine status based on embed
        let status: ModerationHitStatus | null = null;
        if (title.includes("✅ Report accepted") || title.includes("Report accepted")) {
          status = ModerationHitStatus.ACCEPTED;
          acceptedCount++;
        } else if (title.includes("❌ Report ignored") || title.includes("Report ignored")) {
          status = ModerationHitStatus.IGNORED;
          ignoredCount++;
        } else {
          // This is a pending report, skip it
          continue;
        }

        // Extract message link from embed fields
        const messageField = embed.fields?.find(
          (field) =>
            field.name &&
            field.name.toLowerCase().includes("message") &&
            field.value &&
            field.value.includes("discord.com")
        );

        if (!messageField) {
          log.warn(`Could not find message link in report ${message.id}`);
          errorCount++;
          continue;
        }

        // Extract the original message ID from the Discord link
        const messageLink = messageField.value.match(
          /https:\/\/discord\.com\/channels\/\d+\/\d+\/(\d+)/
        );
        if (!messageLink) {
          log.warn(`Could not parse message link in report ${message.id}: ${messageField.value}`);
          errorCount++;
          continue;
        }

        const originalMessageId = messageLink[1];

        // Check if already updated
        const existingHit = await db.findOne(ModerationHit, { messageId: originalMessageId }, true);
        if (existingHit && existingHit.status !== ModerationHitStatus.PENDING) {
          alreadyUpdatedCount++;
          continue;
        }

        if (!dryRun) {
          // Update the database
          const updated = await db.findOneAndUpdate(
            ModerationHit,
            { messageId: originalMessageId },
            { status },
            { upsert: false, new: true }
          );

          if (updated) {
            log.info(`Updated moderation hit ${originalMessageId} to status: ${status}`);
          } else {
            log.warn(`Could not find moderation hit for message ${originalMessageId}`);
            errorCount++;
          }
        }

        processedCount++;

        // Update progress every 50 processed reports
        if (processedCount % 50 === 0) {
          await interaction.editReply({
            embeds: [
              BasicEmbed(
                client,
                "🔄 Processing",
                `Processed ${processedCount} reports...\n` +
                  `Accepted: ${acceptedCount}, Ignored: ${ignoredCount}\n` +
                  `Already updated: ${alreadyUpdatedCount}, Errors: ${errorCount}`
              ),
            ],
          });
        }
      } catch (error) {
        log.error(`Error processing message ${message.id}:`, error);
        errorCount++;
      }
    }

    // Final summary
    const summaryEmbed = BasicEmbed(
      client,
      dryRun ? "🔍 Dry Run Complete" : "✅ Update Complete",
      `**Summary:**\n` +
        `Total messages scanned: ${allMessages.length}\n` +
        `Moderation reports processed: ${processedCount}\n` +
        `Accepted reports: ${acceptedCount}\n` +
        `Ignored reports: ${ignoredCount}\n` +
        `Already updated: ${alreadyUpdatedCount}\n` +
        `Errors: ${errorCount}\n\n` +
        (dryRun ? "**No changes were made (dry run mode)**" : "**Database has been updated**")
    );

    await interaction.editReply({ embeds: [summaryEmbed] });
  } catch (error) {
    log.error("Error in retroactive mod update:", error);
    await interaction.editReply({
      embeds: [BasicEmbed(client, "❌ Error", "An error occurred while processing the channel.")],
    });
  }
}
