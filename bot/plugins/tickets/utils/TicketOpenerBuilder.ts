/**
 * TicketOpenerBuilder - Builds opener messages with category buttons/dropdown
 */

import { ActionRowBuilder, ButtonStyle, type ColorResolvable } from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import type { ITicketOpener } from "../models/TicketOpener.js";
import TicketCategory from "../models/TicketCategory.js";
import { OpenerUIType, MAX_OPENER_CATEGORIES } from "../types/index.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";

/**
 * Build the ticket opener message
 */
export async function buildOpenerMessage(
  lib: LibAPI,
  opener: ITicketOpener,
  guildId: string,
  logger: PluginLogger,
): Promise<{
  embed: ReturnType<LibAPI["createEmbedBuilder"]>;
  components: ActionRowBuilder<any>[];
}> {
  // Fetch active categories for this opener
  const categories = await TicketCategory.find({
    id: { $in: opener.categoryIds },
    guildId,
    isActive: true,
  }).limit(MAX_OPENER_CATEGORIES);

  if (categories.length === 0) {
    logger.warn(`Opener ${opener.id} has no active categories`);
  }

  // Build embed
  const embed = lib
    .createEmbedBuilder()
    .setTitle(opener.embedTitle)
    .setDescription(opener.embedDescription)
    .setColor((opener.embedColor as ColorResolvable) || "Blue");

  if (opener.embedImage) embed.setImage(opener.embedImage);
  if (opener.embedThumbnail) embed.setThumbnail(opener.embedThumbnail);

  const components: ActionRowBuilder<any>[] = [];

  if (opener.uiType === OpenerUIType.BUTTONS) {
    // Build button grid (max 25 buttons in 5 rows of 5)
    const buttons: any[] = [];

    for (const category of categories) {
      const button = lib.createButtonBuilderPersistent("ticket.opener.category", {
        categoryId: category.id,
        guildId,
        openerId: opener.id,
      });

      button.setLabel(category.name.substring(0, 80)).setStyle(ButtonStyle.Primary);

      if (category.emoji) {
        try {
          button.setEmoji(category.emoji);
        } catch (error) {
          logger.warn(`Invalid emoji for category ${category.id}:`, error);
        }
      }

      await button.ready();
      buttons.push(button);
    }

    // Split into rows (max 5 per row)
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder<any>().addComponents(...buttons.slice(i, i + 5));
      components.push(row);
    }
  } else if (opener.uiType === OpenerUIType.DROPDOWN) {
    // Build dropdown menu
    const menu = lib.createStringSelectMenuBuilderPersistent("ticket.opener.category", {
      guildId,
      openerId: opener.id,
    });

    menu.setPlaceholder("Select a ticket category").setMinValues(1).setMaxValues(1);

    for (const category of categories) {
      try {
        menu.addOptions({
          label: category.name.substring(0, 100),
          value: category.id,
          description: category.description?.substring(0, 100),
          emoji: category.emoji || undefined,
        });
      } catch (error) {
        logger.warn(`Failed to add option for category ${category.id}:`, error);
      }
    }

    await menu.ready();
    components.push(new ActionRowBuilder<any>().addComponents(menu));
  }

  return { embed, components };
}
