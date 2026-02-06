/**
 * /game-admin <message_id> — Admin controls for active games
 *
 * Owner-only command. Looks up a Connect4 or TicTacToe game by message ID
 * and presents admin actions (end, declare winner, force draw).
 *
 * Converted from v0 ContextMenuCommandBuilder to slash command because
 * v1's CommandManager only supports ChatInputCommandInteraction.
 */

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinigamesPluginAPI } from "../index.js";
import Connect4 from "../models/Connect4.js";
import TicTacToe from "../models/TicTacToe.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minigames:game-admin");

export const data = new SlashCommandBuilder()
  .setName("game-admin")
  .setDescription("Admin controls for active games (owner-only)")
  .addStringOption((opt) => opt.setName("message_id").setDescription("The message ID of the game to manage").setRequired(true));

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;

  // ── Owner-only gate ──────────────────────────────────────────────
  const ownerIds = (process.env.OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!ownerIds.includes(interaction.user.id)) {
    await interaction.reply({ content: "❌ This command is restricted to bot owners.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinigamesPluginAPI>("minigames");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minigames plugin not loaded.");
    return;
  }

  const messageId = interaction.options.getString("message_id", true).trim();

  // Look up game by message ID
  const connect4Game = await Connect4.findOne({ messageId });
  const tictactoeGame = await TicTacToe.findOne({ messageId });

  if (!connect4Game && !tictactoeGame) {
    await interaction.editReply("❌ No active game found for that message ID.");
    return;
  }

  const game = connect4Game ?? tictactoeGame;
  const gameType = connect4Game ? "Connect4" : "TicTacToe";

  // Build admin panel embed
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0xff9900)
    .setTitle(`🛠️ Game Admin — ${gameType}`)
    .setDescription(`**Game ID:** ${messageId}\n` + `**Players:** <@${game!.player1}> vs <@${game!.player2}>\n` + `**Status:** ${game!.gameOver ? "Ended" : "Active"}`)
    .addFields({ name: "Select an action", value: "Choose what you want to do with this game." })
    .setTimestamp();

  // Ephemeral select menu (5 min TTL)
  const selectMenu = pluginAPI.lib.createStringSelectMenuBuilder(
    async (selectInteraction) => {
      // Re-verify owner at interaction time
      if (!ownerIds.includes(selectInteraction.user.id)) {
        await selectInteraction.reply({ content: "❌ Only bot owners can use game admin controls.", ephemeral: true });
        return;
      }

      const action = selectInteraction.values[0];

      try {
        switch (action) {
          case "end": {
            const ended = gameType === "Connect4" ? await pluginAPI.gameService.forceEndConnect4(messageId) : await pluginAPI.gameService.forceEndTicTacToe(messageId);

            if (!ended) {
              await selectInteraction.reply({ content: "❌ Game not found or already ended.", ephemeral: true });
              return;
            }

            // Try to remove components from the game message
            try {
              const channel = interaction.channel;
              if (channel) {
                const msg = await channel.messages.fetch(messageId).catch(() => null);
                if (msg) await msg.edit({ components: [] });
              }
            } catch {
              /* ignore if message can't be edited */
            }

            await selectInteraction.reply({ content: "✅ Game ended by admin.", ephemeral: true });
            log.info(`Game admin: ${gameType} game ${messageId} ended by ${selectInteraction.user.tag}`);
            break;
          }

          case "winner1":
          case "winner2": {
            const winnerId = action === "winner1" ? game!.player1 : game!.player2;

            const success = gameType === "Connect4" ? await pluginAPI.gameService.setConnect4Winner(messageId, winnerId) : await pluginAPI.gameService.setTicTacToeWinner(messageId, winnerId);

            if (!success) {
              await selectInteraction.reply({ content: "❌ Game not found or already ended.", ephemeral: true });
              return;
            }

            // Update the game message
            try {
              const channel = interaction.channel;
              if (channel) {
                const msg = await channel.messages.fetch(messageId).catch(() => null);
                if (msg) {
                  const winEmbed = pluginAPI.lib
                    .createEmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle(`🎮 ${gameType} — Admin Declared Winner`)
                    .setDescription(`**Winner:** <@${winnerId}> 🏆\n**Declared by:** ${selectInteraction.user}`)
                    .setTimestamp();

                  await msg.edit({ embeds: [winEmbed], components: [] });
                }
              }
            } catch {
              /* ignore */
            }

            await selectInteraction.reply({ content: `✅ Declared <@${winnerId}> as the winner.`, ephemeral: true });
            log.info(`Game admin: ${gameType} game ${messageId} winner set to ${winnerId} by ${selectInteraction.user.tag}`);
            break;
          }

          case "draw": {
            const drawn = gameType === "Connect4" ? await pluginAPI.gameService.setConnect4Draw(messageId) : await pluginAPI.gameService.setTicTacToeDraw(messageId);

            if (!drawn) {
              await selectInteraction.reply({ content: "❌ Game not found or already ended.", ephemeral: true });
              return;
            }

            try {
              const channel = interaction.channel;
              if (channel) {
                const msg = await channel.messages.fetch(messageId).catch(() => null);
                if (msg) {
                  const drawEmbed = pluginAPI.lib
                    .createEmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle(`🎮 ${gameType} — Admin Declared Draw`)
                    .setDescription(`**Result:** Draw 🤝\n**Declared by:** ${selectInteraction.user}`)
                    .setTimestamp();

                  await msg.edit({ embeds: [drawEmbed], components: [] });
                }
              }
            } catch {
              /* ignore */
            }

            await selectInteraction.reply({ content: "✅ Game declared as a draw.", ephemeral: true });
            log.info(`Game admin: ${gameType} game ${messageId} declared draw by ${selectInteraction.user.tag}`);
            break;
          }
        }
      } catch (error) {
        log.error("Error in game admin action:", error);
        await selectInteraction
          .reply({
            content: "❌ An error occurred while processing the action.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    },
    300, // 5 min TTL
  );

  selectMenu
    .setPlaceholder("Select an action...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("End Game").setDescription("End the game immediately").setValue("end").setEmoji("🛑"),
      new StringSelectMenuOptionBuilder().setLabel("Declare Winner — Player 1").setDescription(`Declare ${game!.player1} as winner`).setValue("winner1").setEmoji("🏆"),
      new StringSelectMenuOptionBuilder().setLabel("Declare Winner — Player 2").setDescription(`Declare ${game!.player2} as winner`).setValue("winner2").setEmoji("🏆"),
      new StringSelectMenuOptionBuilder().setLabel("Force Draw").setDescription("Declare the game as a draw").setValue("draw").setEmoji("🤝"),
    );

  await selectMenu.ready();

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.editReply({ embeds: [embed], components: [row] });

  log.info(`Game admin menu opened for ${gameType} game ${messageId} by ${interaction.user.tag}`);
}
