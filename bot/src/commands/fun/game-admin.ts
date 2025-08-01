import { 
  ApplicationCommandType, 
  ContextMenuCommandBuilder, 
  ActionRowBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  ButtonStyle,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  MessageComponentInteraction
} from "discord.js";
import { LegacyContextMenuCommandProps, ButtonKit } from "@heimdall/command-handler";
import Database from "../../utils/data/database";
import Connect4Schema, { Connect4SchemaType } from "../../models/Connect4Schema";
import TicTacToeSchema, { TicTacToeSchemaType } from "../../models/TicTacToeSchema";
import { getConnect4Embed } from "../fun/connect4";
import { getTicTacToeEmbed } from "../fun/tictactoe";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";

const db = new Database();
const env = FetchEnvs();

export const data = new ContextMenuCommandBuilder()
  .setName("Game Admin")
  .setType(ApplicationCommandType.Message)
  .setDMPermission(false);

export const options = {
  devOnly: false,
};

export async function run({ interaction, client, handler }: LegacyContextMenuCommandProps) {
  if (!interaction.isMessageContextMenuCommand()) {
    return interaction.reply({
      content: "This command can only be used on messages.",
      ephemeral: true,
    });
  }

  // Check if user is owner
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: "Only bot owners can use this command.",
      ephemeral: true,
    });
  }

  const targetMessage = interaction.targetMessage;
  
  // Try to find the game in both databases
  let connect4Game: Connect4SchemaType | null = null;
  let tictactoeGame: TicTacToeSchemaType | null = null;
  let gameType: "connect4" | "tictactoe" | null = null;

  try {
    connect4Game = await db.findOne(Connect4Schema, { messageId: targetMessage.id }) as Connect4SchemaType;
    if (connect4Game) {
      gameType = "connect4";
    } else {
      tictactoeGame = await db.findOne(TicTacToeSchema, { messageId: targetMessage.id }) as TicTacToeSchemaType;
      if (tictactoeGame) {
        gameType = "tictactoe";
      }
    }
  } catch (error) {
    log.error("Error finding game:", error);
  }

  if (!gameType) {
    return interaction.reply({
      content: "This message is not associated with a Connect 4 or TicTacToe game.",
      ephemeral: true,
    });
  }

  const game = gameType === "connect4" ? connect4Game! : tictactoeGame!;
  
  // Create admin panel
  const restartGameBtn = new ButtonKit()
    .setEmoji("🔄")
    .setLabel("Restart Game")
    .setStyle(ButtonStyle.Primary)
    .setCustomId(`gameadmin_restart_${targetMessage.id}`);

  const endGameBtn = new ButtonKit()
    .setEmoji("🏁")
    .setLabel("End Game")
    .setStyle(ButtonStyle.Danger)
    .setCustomId(`gameadmin_end_${targetMessage.id}`);

  const declareWinnerBtn = new ButtonKit()
    .setEmoji("🏆")
    .setLabel("Declare Winner")
    .setStyle(ButtonStyle.Success)
    .setCustomId(`gameadmin_declare_winner_${targetMessage.id}`);

  const forceDrawBtn = new ButtonKit()
    .setEmoji("🤝")
    .setLabel("Force Draw")
    .setStyle(ButtonStyle.Secondary)
    .setCustomId(`gameadmin_force_draw_${targetMessage.id}`);

  const row1 = new ActionRowBuilder<ButtonKit>().addComponents(
    restartGameBtn,
    endGameBtn
  );

  const row2 = new ActionRowBuilder<ButtonKit>().addComponents(
    declareWinnerBtn,
    forceDrawBtn
  );

  const embed = BasicEmbed(
    client,
    `${gameType === "connect4" ? "Connect 4" : "TicTacToe"} Game Admin`,
    `**Game Type:** ${gameType === "connect4" ? "Connect 4" : "TicTacToe"}
    **Challenger:** <@${game.initiatorId}>
    **Opponent:** <@${game.opponentId}>
    **Current Turn:** <@${game.turn}>
    **Game Over:** ${game.gameOver ? "Yes" : "No"}
    **Message ID:** \`${targetMessage.id}\`
    
    Use the buttons below to manage this game.`
  );

  await interaction.reply({
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true,
  });

  const interactionMessage = await interaction.fetchReply();

  // Set up button interactions
  restartGameBtn.onClick(async (btnInteraction) => {
    await showConfirmationDialog(btnInteraction, "restart", targetMessage.id, gameType!);
  }, { message: interactionMessage });

  endGameBtn.onClick(async (btnInteraction) => {
    await showConfirmationDialog(btnInteraction, "end", targetMessage.id, gameType!);
  }, { message: interactionMessage });

  declareWinnerBtn.onClick(async (btnInteraction) => {
    await showDeclareWinnerModal(btnInteraction, targetMessage.id, gameType!);
  }, { message: interactionMessage });

  forceDrawBtn.onClick(async (btnInteraction) => {
    await showConfirmationDialog(btnInteraction, "draw", targetMessage.id, gameType!);
  }, { message: interactionMessage });
}

async function showDeclareWinnerModal(
  interaction: MessageComponentInteraction,
  messageId: string,
  gameType: "connect4" | "tictactoe"
) {
  const modal = new ModalBuilder()
    .setCustomId(`gameadmin_winner_modal_${messageId}_${gameType}`)
    .setTitle("Declare Winner")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("winnerId")
          .setLabel("Winner User ID (or 'draw' for tie)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter Discord User ID or 'draw' for tie")
          .setRequired(true)
          .setMinLength(4)
          .setMaxLength(20)
      )
    );

  await interaction.showModal(modal);
}

async function showConfirmationDialog(
  interaction: MessageComponentInteraction,
  action: "restart" | "end" | "draw",
  messageId: string,
  gameType: "connect4" | "tictactoe"
) {
  const actionText = action === "restart" ? "restart" : action === "end" ? "end" : "force draw for";
  const emoji = action === "restart" ? "🔄" : action === "end" ? "🏁" : "🤝";

  const confirmBtn = new ButtonKit()
    .setEmoji("✅")
    .setLabel(`Confirm ${action === "restart" ? "Restart" : action === "end" ? "End" : "Draw"}`)
    .setStyle(action === "end" ? ButtonStyle.Danger : ButtonStyle.Success)
    .setCustomId(`gameadmin_confirm_${action}_${messageId}_${gameType}`);

  const cancelBtn = new ButtonKit()
    .setEmoji("❌")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary)
    .setCustomId(`gameadmin_cancel_${action}_${messageId}`);

  const row = new ActionRowBuilder<ButtonKit>().addComponents(confirmBtn, cancelBtn);

  const embed = BasicEmbed(
    interaction.client,
    "Confirm Action",
    `${emoji} Are you sure you want to **${actionText}** this ${gameType === "connect4" ? "Connect 4" : "TicTacToe"} game?
    
    This action cannot be undone.`
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });

  const confirmMessage = await interaction.fetchReply();

  confirmBtn.onClick(async (btnInteraction) => {
    await executeAction(btnInteraction, action, messageId, gameType);
  }, { message: confirmMessage });

  cancelBtn.onClick(async (btnInteraction) => {
    await btnInteraction.update({
      content: "Action cancelled.",
      embeds: [],
      components: [],
    });
  }, { message: confirmMessage });
}

async function executeAction(
  interaction: MessageComponentInteraction,
  action: "restart" | "end" | "draw",
  messageId: string,
  gameType: "connect4" | "tictactoe"
) {
  try {
    if (gameType === "connect4") {
      const game = await db.findOne(Connect4Schema, { messageId }) as Connect4SchemaType;
      if (!game) {
        return interaction.update({
          content: "Game not found in database.",
          embeds: [],
          components: [],
        });
      }

      if (action === "restart") {
        // Reset game state
        for (let row = 0; row < game.height; row++) {
          for (let col = 0; col < game.width; col++) {
            game.gameState[`${row}${col}`] = "⚪";
          }
        }
        game.gameOver = false;
        game.turn = Math.random() > 0.5 ? game.initiatorId : game.opponentId;
      } else {
        game.gameOver = true;
      }

      await db.findOneAndUpdate(Connect4Schema, { messageId }, game);

      // Update the original game message
      const channel = await interaction.client.channels.fetch(game.channelId);
      if (channel?.isTextBased()) {
        const gameMessage = await channel.messages.fetch(messageId);
        
        if (action === "draw") {
          const embed = getConnect4Embed(game, interaction.client, true);
          await gameMessage.edit({
            embeds: [embed],
            components: [], // Disable buttons
          });
        } else if (action === "end") {
          await gameMessage.edit({
            components: [], // Just disable buttons
          });
        } else if (action === "restart") {
          const embed = getConnect4Embed(game, interaction.client);
          
          // Re-enable the appropriate buttons
          const makeMoveButton = new ButtonKit()
            .setEmoji("🎯")
            .setLabel("Make Move")
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`connect4_move_${messageId}`);

          const makeMoveRow = new ActionRowBuilder<ButtonKit>().addComponents(makeMoveButton);

          await gameMessage.edit({
            embeds: [embed],
            components: [makeMoveRow],
          });
        }
      }
    } else {
      // TicTacToe game
      const game = await db.findOne(TicTacToeSchema, { messageId }) as TicTacToeSchemaType;
      if (!game) {
        return interaction.update({
          content: "Game not found in database.",
          embeds: [],
          components: [],
        });
      }

      if (action === "restart") {
        // Reset game state
        for (let x = 0; x < game.size; x++) {
          for (let y = 0; y < game.size; y++) {
            game.gameState[`${x}${y}`] = "⠀";
          }
        }
        game.gameOver = false;
        game.turn = Math.random() > 0.5 ? game.initiatorId : game.opponentId;
      } else {
        game.gameOver = true;
      }

      await db.findOneAndUpdate(TicTacToeSchema, { messageId }, game);

      // Update the original game message
      const channel = await interaction.client.channels.fetch(game.channelId);
      if (channel?.isTextBased()) {
        const gameMessage = await channel.messages.fetch(messageId);
        
        if (action === "draw") {
          const embed = getTicTacToeEmbed(game, interaction.client, true);
          await gameMessage.edit({
            embeds: [embed],
            components: [], // Disable buttons
          });
        } else if (action === "end") {
          await gameMessage.edit({
            components: [], // Just disable buttons
          });
        } else if (action === "restart") {
          const embed = getTicTacToeEmbed(game, interaction.client);
          
          // Re-enable the appropriate buttons
          const makeMoveButton = new ButtonKit()
            .setEmoji("🎯")
            .setLabel("Make Move")
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`tictactoe_move_${messageId}`);

          const makeMoveRow = new ActionRowBuilder<ButtonKit>().addComponents(makeMoveButton);

          await gameMessage.edit({
            embeds: [embed],
            components: [makeMoveRow],
          });
        }
      }
    }

    const actionText = action === "restart" ? "restarted" : action === "end" ? "ended" : "set to draw";
    await interaction.update({
      content: `✅ Game has been ${actionText} successfully!`,
      embeds: [],
      components: [],
    });

  } catch (error) {
    log.error("Error executing admin action:", error);
    await interaction.update({
      content: "An error occurred while executing the action.",
      embeds: [],
      components: [],
    });
  }
}
