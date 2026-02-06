/**
 * /ticket-admin subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { handleCategoryCreate } from "./category-create.js";
import { handleCategoryEdit } from "./category-edit.js";
import { handleCategoryDelete } from "./category-delete.js";
import { handleCategoryList } from "./category-list.js";
import { handleCategoryQuestions } from "./category-questions.js";
import { handleCategoryPreview } from "./category-preview.js";
import { handleOpenerCreate } from "./opener-create.js";
import { handleOpenerEdit } from "./opener-edit.js";
import { handleOpenerDelete } from "./opener-delete.js";
import { handleOpenerList } from "./opener-list.js";
import { handleOpenerPost } from "./opener-post.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const group = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  if (group === "category") {
    switch (subcommand) {
      case "create":
        await handleCategoryCreate(context);
        break;
      case "edit":
        await handleCategoryEdit(context);
        break;
      case "delete":
        await handleCategoryDelete(context);
        break;
      case "list":
        await handleCategoryList(context);
        break;
      case "questions":
        await handleCategoryQuestions(context);
        break;
      case "preview":
        await handleCategoryPreview(context);
        break;
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  } else if (group === "opener") {
    switch (subcommand) {
      case "create":
        await handleOpenerCreate(context);
        break;
      case "edit":
        await handleOpenerEdit(context);
        break;
      case "delete":
        await handleOpenerDelete(context);
        break;
      case "list":
        await handleOpenerList(context);
        break;
      case "post":
        await handleOpenerPost(context);
        break;
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  } else {
    await interaction.reply({ content: "❌ Unknown subcommand group.", ephemeral: true });
  }
}
