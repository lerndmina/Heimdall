/**
 * /emojify <text> — Convert text to regional indicator emoji letters
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

/** Regional indicator + number emoji map */
const EMOJI_MAP: Record<string, string> = {
  a: "🇦",
  b: "🇧",
  c: "🇨",
  d: "🇩",
  e: "🇪",
  f: "🇫",
  g: "🇬",
  h: "🇭",
  i: "🇮",
  j: "🇯",
  k: "🇰",
  l: "🇱",
  m: "🇲",
  n: "🇳",
  o: "🇴",
  p: "🇵",
  q: "🇶",
  r: "🇷",
  s: "🇸",
  t: "🇹",
  u: "🇺",
  v: "🇻",
  w: "🇼",
  x: "🇽",
  y: "🇾",
  z: "🇿",
  "0": "0️⃣",
  "1": "1️⃣",
  "2": "2️⃣",
  "3": "3️⃣",
  "4": "4️⃣",
  "5": "5️⃣",
  "6": "6️⃣",
  "7": "7️⃣",
  "8": "8️⃣",
  "9": "9️⃣",
  "!": "❗",
  "?": "❓",
  " ": " ",
};

export const data = new SlashCommandBuilder()
  .setName("emojify")
  .setDescription("Convert text to emoji letters")
  .addStringOption((opt) => opt.setName("text").setDescription("Text to emojify").setRequired(true).setMaxLength(100));

export const config = {
  allowInDMs: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const text = interaction.options.getString("text", true);

  const emojified = text
    .toLowerCase()
    .split("")
    .map((char) => {
      if (char >= "a" && char <= "z") {
        return `:regional_indicator_${char}:`;
      }
      return EMOJI_MAP[char] || char;
    })
    .join(" ");

  if (emojified.length > 2000) {
    await interaction.reply({
      content: "❌ The emojified text is too long! Try a shorter message.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply("# " + emojified);
}
