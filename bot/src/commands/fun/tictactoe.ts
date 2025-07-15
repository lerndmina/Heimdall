import { SlashCommandProps, CommandOptions, ButtonKit } from "commandkit";
import {
  ActionRow,
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Collection,
  SlashCommandBuilder,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import Database from "../../utils/data/database";
import TicTacToeSchema, { TicTacToeSchemaType } from "../../models/TicTacToeSchema";
import { debugMsg } from "../../utils/TinyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import log from "../../utils/log";

const db = new Database();

export const TTT_X = "X";
export const TTT_O = "O";
export const TTT_BLANK = "⠀";

export const data = new SlashCommandBuilder()
  .setName("tictactoe")
  .setDescription("Play a game of Tic Tac Toe.")
  .addUserOption((option) =>
    option.setName("opponent").setDescription("The user to play against.").setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName("size").setDescription("The size of the board.").setRequired(false)
  )
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"], // For now so only moderators can initiate games.
  // TODO: Make this configurable.
};

const MIN_SIZE = 3;
const MAX_SIZE = 5;

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const commandName = interaction.commandName;

  const size = interaction.options.getInteger("size", false) || 3;
  if (size < MIN_SIZE || size > MAX_SIZE) {
    interaction.reply({
      content: `The size of the board must be between ${MIN_SIZE} and ${MAX_SIZE}.`,
      ephemeral: true,
    });
    return;
  }

  const opponent = interaction.options.getUser("opponent", true);
  const challenger = interaction.user;
  if (opponent.bot) {
    interaction.reply({
      content: "You cannot play against a bot.",
      ephemeral: true,
    });
    return;
  }
  if (opponent.id === challenger.id) {
    interaction.reply({
      content: "You cannot play against yourself.",
      ephemeral: true,
    });
    return;
  }

  setCommandCooldown(userCooldownKey(interaction.user.id, commandName), 30);

  await interaction.reply({
    content: `Inviting <@${opponent.id}> to play a game of Tic Tac Toe...`,
    ephemeral: true,
  });

  const buttonAccept = new ButtonKit()
    .setEmoji("👍")
    .setLabel("Accept")
    .setStyle(ButtonStyle.Primary)
    .setCustomId("pre-tictactoe-accept" + interaction.id);

  const buttonDecline = new ButtonKit()
    .setEmoji("👎")
    .setLabel("Decline")
    .setStyle(ButtonStyle.Danger)
    .setCustomId("pre-tictactoe-decline" + interaction.id);

  const acceptDeclineRow = new ActionRowBuilder<ButtonKit>().addComponents(
    buttonAccept,
    buttonDecline
  );

  const message = await interaction.channel!.send({
    content: `<@${opponent.id}>`,
    components: [acceptDeclineRow],
    embeds: [
      BasicEmbed(
        client,
        "Tic Tac Toe",
        `Hey <@${opponent.id}> you have been challenged by <@${interaction.user.id}> to play a game of Tic Tac Toe with a board size of \`${size}\`.`,
        [
          {
            name: "Accept",
            value: "Click the button below to accept the challenge.",
            inline: true,
          },
          {
            name: "Decline",
            value: "Click the button below to decline the challenge.",
            inline: true,
          },
        ]
      ),
    ],
  });

  buttonAccept.onClick(
    async (interaction) => {
      if (interaction.user.id !== opponent.id) {
        interaction.reply({ content: "Only the opponent can accept or decline.", ephemeral: true });
        return;
      }
      const { rows, gameState } = initiateGameState(size, interaction);

      const turn = Math.random() > 0.5 ? challenger.id : opponent.id;

      try {
        interaction.deferUpdate();

        const data: TicTacToeSchemaType = {
          guildId: message.guildId!,
          messageId: message.id,
          channelId: message.channelId,
          initiatorId: challenger.id,
          opponentId: opponent.id,
          size,
          gameState,
          turn,
          gameOver: false,
          createdAt: new Date(),
        };

        await message.edit({
          content: ``,
          components: rows,
          embeds: [getTicTacToeEmbed(data, client)],
        });

        await db.findOneAndUpdate(TicTacToeSchema, { messageId: data.messageId }, data);
        setCommandCooldown(userCooldownKey(interaction.user.id, commandName), 120);
        debugMsg(`Game set up for ${interaction.user.tag} and ${opponent.tag}`);
      } catch (error) {
        log.error(error);
        await interaction.reply({
          content: "An error occurred while setting up the game.",
          ephemeral: true,
        });

        await db.deleteOne(TicTacToeSchema, { initiatorId: interaction.user.id });
        return;
      }
    },
    { message }
  );
  buttonDecline.onClick(
    async (interaction) => {
      if (interaction.user.id !== opponent.id) {
        interaction.reply({ content: "Only the opponent can accept or decline.", ephemeral: true });
        return;
      }
      interaction.deferUpdate();
      message.edit({
        components: [],
        content: ``,
        embeds: [
          BasicEmbed(
            client,
            "Tic Tac Toe",
            `The game has been cancelled, <@${opponent.id}> declined the challenge.`
          ),
        ],
      });
    },
    { message }
  );
}
function initiateGameState(size: number, interaction: BaseInteraction) {
  const gameState: Record<`${number}${number}`, string> = {};
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      gameState[`${x}${y}`] = TTT_BLANK;
    }
  }

  const rows = getButtonsForGameState(gameState, size, interaction);

  return { gameState, rows };
}

export function getButtonsForGameState(
  gameState: Record<`${number}${number}`, string>,
  size: number,
  interaction: BaseInteraction,
  disableAll: boolean = false
) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let x = 0; x < size; x++) {
    let buttons: ButtonBuilder[] = [];
    for (let y = 0; y < size; y++) {
      let buttonStyle: ButtonStyle;
      if (gameState[`${x}${y}`] === TTT_O) {
        buttonStyle = ButtonStyle.Success;
      } else if (gameState[`${x}${y}`] === TTT_X) {
        buttonStyle = ButtonStyle.Danger;
      } else {
        buttonStyle = ButtonStyle.Primary;
      }
      let button = new ButtonBuilder()
        .setCustomId(`tictactoe_${x}_${y}_${interaction.id}`)
        .setLabel(gameState[`${x}${y}`] || TTT_BLANK)
        .setStyle(buttonStyle)
        .setDisabled(disableAll);
      buttons.push(button);
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  return rows;
}

export function getTicTacToeEmbed(
  game: TicTacToeSchemaType,
  client: Client<true>,
  isDraw?: boolean,
  { winnerId, looserId }: { winnerId?: string; looserId?: string } = {}
) {
  if (isDraw) {
    return BasicEmbed(
      client,
      "Tic Tac Toe",
      `The game between <@${game.initiatorId}> and <@${game.opponentId}> resulted in a draw! GG!`
    );
  }
  if (winnerId) {
    const possibleWinnerMessages = [
      `The game between <@${game.initiatorId}> and <@${game.opponentId}> resulted in a win for <@${winnerId}>! GG!`,
      `<@${winnerId}> won the game against <@${looserId}>! GG!`,
      `<@${winnerId}> destroyed <@${looserId}>!`,
      `What a fine display of skill <@${winnerId}>! GG!`,
    ];
    const winnerMessage =
      possibleWinnerMessages[Math.floor(Math.random() * possibleWinnerMessages.length)];
    return BasicEmbed(client, "Tic Tac Toe", winnerMessage);
  }

  return BasicEmbed(
    client,
    "Tic Tac Toe",
    `<@${game.initiatorId}> vs <@${game.opponentId}>\n\nTurn: <@${game.turn}>`
  );
}
