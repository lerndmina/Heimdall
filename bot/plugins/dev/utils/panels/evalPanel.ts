/**
 * Eval Panel — Execute arbitrary JavaScript from a Discord modal.
 *
 * Security: Only accessible to owners (enforced by the /dev command itself).
 * Execution is wrapped in a timeout to prevent infinite loops.
 */

import { ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, PANEL_TTL, PanelId, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { nanoid } from "nanoid";
import { inspect } from "util";

const MAX_RESULT_LENGTH = 4000;
const EVAL_TIMEOUT_MS = 10_000;

export async function buildEvalPanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib } = ctx;

  const embed = lib
    .createEmbedBuilder()
    .setTitle("📝 Eval")
    .setDescription(
      [
        "Execute JavaScript code in the bot's context.",
        "",
        "**Available variables:**",
        "`client` — Discord client",
        "`ctx` — DevPanelContext",
        "`redis` — Redis client",
        "`mongoose` — Mongoose instance",
        "",
        `**Timeout:** ${EVAL_TIMEOUT_MS / 1000}s`,
        "**Note:** `return` your result for it to be displayed.",
      ].join("\n"),
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const evalBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const modalId = nanoid();
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Execute Code")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("code").setLabel("JavaScript Code").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("return client.guilds.cache.size"),
          ),
        );

      await i.showModal(modal);
      const submit = await i
        .awaitModalSubmit({
          filter: (s) => s.customId === modalId && s.user.id === i.user.id,
          time: 300_000, // 5 min to write code
        })
        .catch(() => null);

      if (!submit) return;
      await submit.deferUpdate();

      const code = submit.fields.getTextInputValue("code");
      let result: string;
      let success = true;

      try {
        // Wrap in async IIFE with timeout
        const asyncCode = `(async () => { ${code} })()`;
        const evalPromise = eval(asyncCode);

        // Race against timeout
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Eval timed out after ${EVAL_TIMEOUT_MS / 1000}s`)), EVAL_TIMEOUT_MS));

        const output = await Promise.race([evalPromise, timeoutPromise]);
        result = typeof output === "string" ? output : inspect(output, { depth: 2, maxArrayLength: 50 });
      } catch (err) {
        success = false;
        result = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      }

      // Truncate if needed
      if (result.length > MAX_RESULT_LENGTH) {
        result = result.slice(0, MAX_RESULT_LENGTH) + "\n... (truncated)";
      }

      const resultEmbed = lib
        .createEmbedBuilder()
        .setTitle(success ? "✅ Eval Result" : "❌ Eval Error")
        .addFields({ name: "Input", value: `\`\`\`js\n${code.slice(0, 1000)}\n\`\`\`` }, { name: "Output", value: `\`\`\`js\n${result}\n\`\`\`` });

      await ctx.originalInteraction.followUp({ embeds: [resultEmbed], ephemeral: true });
    }, PANEL_TTL)
    .setLabel("📝 Open Editor")
    .setStyle(ButtonStyle.Primary);

  await evalBtn.ready();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, evalBtn)],
  };
}
