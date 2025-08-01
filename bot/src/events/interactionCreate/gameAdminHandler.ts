import { Events, ModalSubmitInteraction, Client } from "discord.js";
import Database from "../../utils/data/database";
import Connect4Schema, { Connect4SchemaType } from "../../models/Connect4Schema";
import TicTacToeSchema, { TicTacToeSchemaType } from "../../models/TicTacToeSchema";
import { getConnect4Embed } from "../../commands/fun/connect4";
import { getTicTacToeEmbed } from "../../commands/fun/tictactoe";
import BasicEmbed from "../../utils/BasicEmbed";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";

const db = new Database();
const env = FetchEnvs();

export default async (interaction: any, client: Client, handler: any) => {
  if (!interaction.isModalSubmit()) return;

  const customId = interaction.customId;

  // Handle declare winner modal
  if (customId.startsWith("gameadmin_winner_modal_")) {
    if (!env.OWNER_IDS.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Only bot owners can use this command.",
        ephemeral: true,
      });
    }

    const parts = customId.split("_");
    const messageId = parts[3];
    const gameType = parts[4] as "connect4" | "tictactoe";

    const winnerId = interaction.fields.getTextInputValue("winnerId").trim();

    try {
      if (gameType === "connect4") {
        const game = (await db.findOne(Connect4Schema, { messageId })) as Connect4SchemaType;
        if (!game) {
          return interaction.reply({
            content: "Game not found in database.",
            ephemeral: true,
          });
        }

        game.gameOver = true;

        let embedTitle = "Connect 4 - Game Over";
        let embedDescription: string;

        if (winnerId.toLowerCase() === "draw" || winnerId.toLowerCase() === "tie") {
          embedDescription = `🤝 **Game ended in a draw!**\n\nPlayers: <@${game.initiatorId}> vs <@${game.opponentId}>`;
        } else {
          // Validate user ID
          if (!/^\d{17,20}$/.test(winnerId)) {
            return interaction.reply({
              content:
                "Invalid user ID format. Please enter a valid Discord user ID (17-20 digits).",
              ephemeral: true,
            });
          }

          if (winnerId !== game.initiatorId && winnerId !== game.opponentId) {
            return interaction.reply({
              content: "Winner must be one of the players in the game.",
              ephemeral: true,
            });
          }

          embedDescription = `🏆 **<@${winnerId}> wins!**\n\nPlayers: <@${game.initiatorId}> vs <@${game.opponentId}>`;
        }

        await db.findOneAndUpdate(Connect4Schema, { messageId }, game);

        // Update the original game message
        const channel = await interaction.client.channels.fetch(game.channelId);
        if (channel?.isTextBased()) {
          const gameMessage = await channel.messages.fetch(messageId);

          const embed = BasicEmbed(interaction.client, embedTitle, embedDescription);

          await gameMessage.edit({
            embeds: [embed],
            components: [], // Disable buttons
          });
        }

        await interaction.reply({
          content: `✅ Winner declared successfully!`,
          ephemeral: true,
        });
      } else {
        // TicTacToe game
        const game = (await db.findOne(TicTacToeSchema, { messageId })) as TicTacToeSchemaType;
        if (!game) {
          return interaction.reply({
            content: "Game not found in database.",
            ephemeral: true,
          });
        }

        game.gameOver = true;

        let embedTitle = "TicTacToe - Game Over";
        let embedDescription: string;

        if (winnerId.toLowerCase() === "draw" || winnerId.toLowerCase() === "tie") {
          embedDescription = `🤝 **Game ended in a draw!**\n\nPlayers: <@${game.initiatorId}> vs <@${game.opponentId}>`;
        } else {
          // Validate user ID
          if (!/^\d{17,20}$/.test(winnerId)) {
            return interaction.reply({
              content:
                "Invalid user ID format. Please enter a valid Discord user ID (17-20 digits).",
              ephemeral: true,
            });
          }

          if (winnerId !== game.initiatorId && winnerId !== game.opponentId) {
            return interaction.reply({
              content: "Winner must be one of the players in the game.",
              ephemeral: true,
            });
          }

          embedDescription = `🏆 **<@${winnerId}> wins!**\n\nPlayers: <@${game.initiatorId}> vs <@${game.opponentId}>`;
        }

        await db.findOneAndUpdate(TicTacToeSchema, { messageId }, game);

        // Update the original game message
        const channel = await interaction.client.channels.fetch(game.channelId);
        if (channel?.isTextBased()) {
          const gameMessage = await channel.messages.fetch(messageId);

          const embed = BasicEmbed(interaction.client, embedTitle, embedDescription);

          await gameMessage.edit({
            embeds: [embed],
            components: [], // Disable buttons
          });
        }

        await interaction.reply({
          content: `✅ Winner declared successfully!`,
          ephemeral: true,
        });
      }
    } catch (error) {
      log.error("Error declaring winner:", error);
      await interaction.reply({
        content: "An error occurred while declaring the winner.",
        ephemeral: true,
      });
    }
  }
};
