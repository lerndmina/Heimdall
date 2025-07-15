import { ActionRowBuilder, ButtonBuilder, ButtonComponent, ButtonComponentData } from "discord.js";

export default function (buttons: ButtonBuilder[], dumbSplit: boolean = true) {
  const components: any = [];

  if (dumbSplit) {
    // Original logic - fill rows with 5 buttons each
    var actionRow = new ActionRowBuilder();

    for (var a = 0; a < buttons.length && a < 25; a++) {
      if (a % 5 == 0 && a > 0) {
        components.push(actionRow);
        actionRow = new ActionRowBuilder();
      }
      actionRow.addComponents(buttons[a]);
    }

    if (actionRow.components.length > 0) components.push(actionRow);
  } else {
    // Intelligent splitting for better visual distribution
    const totalButtons = Math.min(buttons.length, 25);
    const maxRows = 5;
    const maxButtonsPerRow = 5;

    // Calculate optimal distribution
    const rows = Math.min(Math.ceil(totalButtons / maxButtonsPerRow), maxRows);
    const buttonsPerRow = Math.ceil(totalButtons / rows);

    let buttonIndex = 0;
    for (let row = 0; row < rows && buttonIndex < totalButtons; row++) {
      const actionRow = new ActionRowBuilder();
      const buttonsInThisRow = Math.min(buttonsPerRow, totalButtons - buttonIndex);

      for (let i = 0; i < buttonsInThisRow; i++) {
        actionRow.addComponents(buttons[buttonIndex]);
        buttonIndex++;
      }

      components.push(actionRow);
    }
  }

  return components as any;
}
