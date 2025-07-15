import {
  type SlashCommandProps,
  createSignal,
  createEffect,
  ButtonKit,
  CommandData,
  CommandOptions,
} from "commandkit";
import {
  ButtonStyle,
  ActionRowBuilder,
  Snowflake,
  SlashCommandBuilder,
  EmbedField,
  MessageComponentInteraction,
} from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { setCommandCooldown, userCooldownKey } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";

export const data = new SlashCommandBuilder()
  .setName("pagination")
  .setDescription("A simple pagination example.");

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
};

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

const INLINE_BOOL = true;

let pages: EmbedField[][] = [];

export const run = async ({ interaction, client }: SlashCommandProps) => {
  setCommandCooldown(userCooldownKey(interaction.user.id, interaction.commandName), 60);
  pages = [
    [{ name: "Page 1", value: "This is page 1", inline: INLINE_BOOL }],
    [{ name: "Page 2", value: "This is page 2", inline: INLINE_BOOL }],
  ];

  // Create the signal & buttons
  const [count, setCount, disposeCountSubscribers] = createSignal(0);
  const { dec, inc, trash, row } = getButtons(interaction.id);

  // Temporary variable to hold button interactions
  let inter: MessageComponentInteraction | null = null;

  const embedTitle = "Pagination Example";
  const embedDescription =
    "Woah, this is a cool example yes. Please press the trash button when you are done.";

  // Send the initial message with the buttons
  const message = await interaction.reply({
    content: ``,
    embeds: [BasicEmbed(client, embedTitle, embedDescription, pages[0])],
    components: [row],
    fetchReply: true,
  });

  // Now, we subscribe to count signal and update the message every time the count changes
  createEffect(() => {
    // Make sure to "always" call the value function inside createEffect, otherwise the subscription will not occur
    const value = count();

    // Now udate the original message
    inter?.update({
      content: ``,
      embeds: [BasicEmbed(client, embedTitle, embedDescription, pages[value])],
    });
  });

  // Handler to decrement the count
  dec.onClick(
    (interaction) => {
      inter = interaction;
      setCount((prev) => {
        if (isCountInBounds(prev, -1)) return prev - 1;
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
        if (isCountInBounds(prev, 1)) return prev + 1;
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
          // Remove the 'onClick' handler and disable the button
          return button.setDisabled(true);
        })
      );

      // Dispose the signal's subscribers
      disposeCountSubscribers();

      // And finally: acknowledge the interaction
      await interaction.update({
        content: "Pagination Closed.",
        components: [disposed],
        embeds: [],
      });
    },
    { message }
  );
};

function isCountInBounds(count: number, change: number) {
  const min = 0;
  const max = pages.length - 1;

  return count + change >= min && count + change <= max;
}
