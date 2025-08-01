import {
  LegacySlashCommandProps,
  LegacyCommandOptions,
  ButtonKit,
} from "@heimdall/command-handler";
import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonStyle,
  Client,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { setCommandCooldown, userCooldownKey } from "../../Bot";
import Database from "../../utils/data/database";
import Connect4Schema, { Connect4SchemaType } from "../../models/Connect4Schema";
import { debugMsg } from "../../utils/TinyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import log from "../../utils/log";

const db = new Database();

export const C4_RED = "🔴";
export const C4_BLUE = "🔵";
export const C4_BLANK = "⚪";

export const data = new SlashCommandBuilder()
  .setName("connect4")
  .setDescription("Play a game of Connect 4.")
  .addUserOption((option) =>
    option.setName("opponent").setDescription("The user to play against.").setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName("width").setDescription("The width of the board (6-10).").setRequired(false)
  )
  .addIntegerOption((option) =>
    option.setName("height").setDescription("The height of the board (5-10).").setRequired(false)
  )
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"], // For now so only moderators can initiate games.
  // TODO: Make this configurable.
};

const MIN_WIDTH = 6;
const MAX_WIDTH = 10;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 10;

const DEFAULT_WIDTH = 7;
const DEFAULT_HEIGHT = 6;

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  const commandName = interaction.commandName;

  const width = interaction.options.getInteger("width", false) || DEFAULT_WIDTH;
  const height = interaction.options.getInteger("height", false) || DEFAULT_HEIGHT;

  if (width < MIN_WIDTH || width > MAX_WIDTH) {
    interaction.reply({
      content: `The width of the board must be between ${MIN_WIDTH} and ${MAX_WIDTH}.`,
      ephemeral: true,
    });
    return;
  }

  if (height < MIN_HEIGHT || height > MAX_HEIGHT) {
    interaction.reply({
      content: `The height of the board must be between ${MIN_HEIGHT} and ${MAX_HEIGHT}.`,
      ephemeral: true,
    });
    return;
  }

  // Check if user is trying to use non-default size without proper permissions
  const isNonDefaultSize = width !== DEFAULT_WIDTH || height !== DEFAULT_HEIGHT;
  if (isNonDefaultSize && !interaction.memberPermissions?.has("ManageMessages")) {
    interaction.reply({
      content:
        "You need the **Manage Messages** permission to create games with custom board sizes.",
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
    content: `Inviting <@${opponent.id}> to play a game of Connect 4...`,
    ephemeral: true,
  });

  const buttonAccept = new ButtonKit()
    .setEmoji("👍")
    .setLabel("Accept")
    .setStyle(ButtonStyle.Primary)
    .setCustomId("pre-connect4-accept" + interaction.id);

  const buttonDecline = new ButtonKit()
    .setEmoji("👎")
    .setLabel("Decline")
    .setStyle(ButtonStyle.Danger)
    .setCustomId("pre-connect4-decline" + interaction.id);

  const acceptDeclineRow = new ActionRowBuilder<ButtonKit>().addComponents(
    buttonAccept,
    buttonDecline
  );

  if (!interaction.channel || !("send" in interaction.channel)) {
    interaction.reply({
      content: "This command can only be used in text channels.",
      ephemeral: true,
    });
    return;
  }

  const message = await interaction.channel.send({
    content: `<@${opponent.id}>`,
    components: [acceptDeclineRow],
    embeds: [
      BasicEmbed(
        client,
        "Connect 4",
        `Hey <@${opponent.id}> you have been challenged by <@${interaction.user.id}> to play a game of Connect 4 with a board size of \`${width}x${height}\`.`,
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

      const { gameState } = initiateGameState(width, height);
      const turn = Math.random() > 0.5 ? challenger.id : opponent.id;

      try {
        interaction.deferUpdate();

        const data: Connect4SchemaType = {
          guildId: message.guildId!,
          messageId: message.id,
          channelId: message.channelId,
          initiatorId: challenger.id,
          opponentId: opponent.id,
          width,
          height,
          gameState,
          turn,
          gameOver: false,
          createdAt: new Date(),
        };

        const columnButtons = getColumnButtons(width, interaction.id);

        await message.edit({
          content: ``,
          components: columnButtons,
          embeds: [getConnect4Embed(data, client)],
        });

        await db.findOneAndUpdate(Connect4Schema, { messageId: data.messageId }, data);
        setCommandCooldown(userCooldownKey(interaction.user.id, commandName), 120);
        debugMsg(`Connect 4 game set up for ${interaction.user.tag} and ${opponent.tag}`);
      } catch (error) {
        log.error(error);
        await interaction.reply({
          content: "An error occurred while setting up the game.",
          ephemeral: true,
        });

        await db.deleteOne(Connect4Schema, { initiatorId: interaction.user.id });
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
            "Connect 4",
            `The game has been cancelled, <@${opponent.id}> declined the challenge.`
          ),
        ],
      });
    },
    { message }
  );
}

export function getColumnButtons(
  width: number,
  gameId: string,
  disabled: boolean = false
): ActionRowBuilder<ButtonKit>[] {
  const buttons: ButtonKit[] = [];

  // Create a button for each column
  for (let col = 1; col <= width; col++) {
    const button = new ButtonKit()
      .setLabel(col.toString())
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`connect4_column_${col - 1}_${gameId}`)
      .setDisabled(disabled);

    buttons.push(button);
  }

  // Distribute buttons across rows (5 buttons per row max)
  const rows: ActionRowBuilder<ButtonKit>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    rows.push(new ActionRowBuilder<ButtonKit>().addComponents(rowButtons));
  }

  return rows;
}

function initiateGameState(width: number, height: number) {
  const gameState: Record<`${number}${number}`, string> = {};
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      gameState[`${row}${col}`] = C4_BLANK;
    }
  }

  return { gameState };
}

export function getConnect4Embed(
  game: Connect4SchemaType,
  client: Client<true>,
  isDraw?: boolean,
  { winnerId, looserId }: { winnerId?: string; looserId?: string } = {}
) {
  if (isDraw) {
    return BasicEmbed(
      client,
      "Connect 4",
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
    return BasicEmbed(client, "Connect 4", winnerMessage);
  }

  const boardDisplay = generateConnect4Board(game.gameState, game.width, game.height);
  const player1Piece = C4_RED;
  const player2Piece = C4_BLUE;

  return BasicEmbed(
    client,
    "Connect 4",
    `${boardDisplay}\n\n${player1Piece} <@${game.initiatorId}> | ${player2Piece} <@${game.opponentId}>\n\nTurn: <@${game.turn}>`
  );
}

function generateConnect4Board(
  gameState: Record<string, string>,
  width: number,
  height: number
): string {
  let board = "";

  // Column indicators with # prefix for larger emojis
  for (let col = 1; col <= width; col++) {
    board += `# ${getNumberEmoji(col)}`;
  }
  board += "\n";

  // Board grid (display top to bottom)
  for (let row = height - 1; row >= 0; row--) {
    for (let col = 0; col < width; col++) {
      board += gameState[`${row}${col}`] || C4_BLANK;
    }
    board += "\n";
  }

  return board;
}

function getNumberEmoji(num: number): string {
  const numberEmojis = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return numberEmojis[num] || num.toString();
}

export function findLowestAvailableRow(
  gameState: Record<string, string>,
  col: number,
  height: number
): number | null {
  for (let row = 0; row < height; row++) {
    if (gameState[`${row}${col}`] === C4_BLANK) {
      return row;
    }
  }
  return null; // Column is full
}

export function checkConnect4Win(
  gameState: Record<string, string>,
  lastRow: number,
  lastCol: number,
  width: number,
  height: number
): string | null {
  const piece = gameState[`${lastRow}${lastCol}`];
  const directions = [
    [0, 1], // Horizontal
    [1, 0], // Vertical
    [1, 1], // Diagonal \
    [1, -1], // Diagonal /
  ];

  for (const [dx, dy] of directions) {
    let count = 1; // Count the piece we just placed

    // Check in both directions
    for (const direction of [-1, 1]) {
      let r = lastRow + dx * direction;
      let c = lastCol + dy * direction;

      while (r >= 0 && r < height && c >= 0 && c < width && gameState[`${r}${c}`] === piece) {
        count++;
        r += dx * direction;
        c += dy * direction;
      }
    }

    if (count >= 4) return piece;
  }

  return null;
}

export function checkConnect4Draw(game: Connect4SchemaType): boolean {
  // Check if the top row is completely filled
  for (let col = 0; col < game.width; col++) {
    if (game.gameState[`${game.height - 1}${col}`] === C4_BLANK) {
      return false; // Still has empty spaces
    }
  }
  return true; // Top row is full, so board is full
}
