/**
 * Presets — Built-in automod rule presets (disabled by default).
 *
 * Enabling a preset creates a mutable copy of the rule that the guild can
 * freely customise. Disabling deletes it. Re-enabling starts fresh.
 */

import { AutomodTarget, AutomodAction } from "../models/AutomodRule.js";

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  target: string;
  patterns: Array<{ regex: string; flags: string; label: string }>;
  matchMode: "any" | "all";
  actions: string[];
  warnPoints: number;
}

export const PRESETS: PresetDefinition[] = [
  {
    id: "invite-links",
    name: "Invite Links",
    description: "Block Discord invite links (discord.gg, discordapp.com/invite)",
    target: AutomodTarget.LINK,
    patterns: [{ regex: "(?:discord\\.gg|discordapp\\.com\\/invite|discord\\.com\\/invite)\\/[\\w-]+", flags: "i", label: "Discord invite URL" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 2,
  },
  {
    id: "mass-mention",
    name: "Mass Mention",
    description: "Detect messages with 5 or more user/role mentions",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "(<@!?\\d+>.*){5,}", flags: "s", label: "5+ user mentions" },
      { regex: "(<@&\\d+>.*){5,}", flags: "s", label: "5+ role mentions" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 3,
  },
  {
    id: "excessive-caps",
    name: "Excessive Caps",
    description: "Detect messages with 70%+ uppercase characters (minimum 10 chars)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "(?=.{10,})(?:[^A-Za-z]*[A-Z]){7}[^a-z]*$", flags: "", label: "70%+ uppercase" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "repeated-text",
    name: "Repeated Characters",
    description: "Detect messages with 10+ repeated characters in a row",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "(.)\\1{9,}", flags: "", label: "10+ repeated chars" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "external-links",
    name: "External Links",
    description: "Block all non-Discord links",
    target: AutomodTarget.LINK,
    patterns: [{ regex: "https?:\\/\\/(?!(?:discord\\.gg|discord\\.com|discordapp\\.com|cdn\\.discordapp\\.com|media\\.discordapp\\.net))[^\\s]+", flags: "i", label: "Non-Discord URL" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "zalgo-text",
    name: "Zalgo Text",
    description: "Detect messages containing zalgo (combining character abuse)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "[\\u0300-\\u036f\\u0489]{3,}", flags: "", label: "Zalgo combining chars" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },

  // ── Profanity & Slur Filters ───────────────────────────────

  {
    id: "slurs-racial",
    name: "Racial Slurs",
    description: "Block common racial slurs and their evasion variants (leetspeak, spacing, special chars)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "n+[\\s\\W_]*[i1!|l]+[\\s\\W_]*[gq9]+[\\s\\W_]*[gq9]+[\\s\\W_]*(?:[e3]+[\\s\\W_]*[r]+|[a@4]+(?:[\\s\\W_]*[sz$5])?)", flags: "i", label: "N-word and variants" },
      { regex: "c+[\\s\\W_]*[o0]+[\\s\\W_]*[o0]+[\\s\\W_]*n+", flags: "i", label: "Racial slur variant" },
      { regex: "k+[\\s\\W_]*[i1!]+[\\s\\W_]*k+[\\s\\W_]*[e3]+", flags: "i", label: "Anti-Jewish slur" },
      { regex: "g+[\\s\\W_]*[o0]+[\\s\\W_]*[o0]+[\\s\\W_]*k+", flags: "i", label: "Anti-Asian slur" },
      { regex: "s+[\\s\\W_]*p+[\\s\\W_]*[i1!]+[\\s\\W_]*c+", flags: "i", label: "Anti-Hispanic slur" },
      { regex: "w+[\\s\\W_]*[e3]+[\\s\\W_]*t+[\\s\\W_]*b+[\\s\\W_]*[a@4]+[\\s\\W_]*c+[\\s\\W_]*k+", flags: "i", label: "Anti-Mexican slur" },
      { regex: "b+[\\s\\W_]*[e3]+[\\s\\W_]*[a@4]+[\\s\\W_]*n+[\\s\\W_]*[e3]+[\\s\\W_]*r+", flags: "i", label: "Anti-Hispanic slur variant" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 5,
  },
  {
    id: "slurs-homophobic",
    name: "Homophobic Slurs",
    description: "Block common homophobic and transphobic slurs with evasion detection",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "f+[\\s\\W_]*[a@4]+[\\s\\W_]*[gq9]+[\\s\\W_]*(?:[gq9]+[\\s\\W_]*(?:[o0]+[\\s\\W_]*t+|[e3]+[\\s\\W_]*d+)?|[sz$5])", flags: "i", label: "Homophobic slur" },
      { regex: "d+[\\s\\W_]*[y]+[\\s\\W_]*k+[\\s\\W_]*[e3]+", flags: "i", label: "Anti-lesbian slur" },
      { regex: "t+[\\s\\W_]*r+[\\s\\W_]*[a@4]+[\\s\\W_]*n+[\\s\\W_]*n+[\\s\\W_]*(?:[y1!]+|[i1!]+[\\s\\W_]*[e3]+[\\s\\W_]*[sz$5]?)", flags: "i", label: "Anti-trans slur" },
      { regex: "s+[\\s\\W_]*h+[\\s\\W_]*[e3]+[\\s\\W_]*m+[\\s\\W_]*[a@4]+[\\s\\W_]*l+[\\s\\W_]*[e3]+", flags: "i", label: "Anti-trans slur variant" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 5,
  },
  {
    id: "profanity-heavy",
    name: "Heavy Profanity",
    description: "Block strong profanity with common evasion patterns",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      {
        regex: "(?:^|\\W)f+[\\s\\W_]*[u\\*]+[\\s\\W_]*c+[\\s\\W_]*k+(?:[\\s\\W_]*[e3]+[\\s\\W_]*[r]+|[\\s\\W_]*[i1!]+[\\s\\W_]*n+[\\s\\W_]*[gq9]+)?(?:\\W|$)",
        flags: "i",
        label: "F-word and derivatives",
      },
      { regex: "(?:^|\\W)c+[\\s\\W_]*[u]+[\\s\\W_]*n+[\\s\\W_]*t+(?:\\W|$)", flags: "i", label: "C-word" },
      {
        regex:
          "(?:^|\\W)(?:r+[\\s\\W_]*[e3]+[\\s\\W_]*t+[\\s\\W_]*[a@4]+[\\s\\W_]*r+[\\s\\W_]*d+|r+[\\s\\W_]*[e3]+[\\s\\W_]*t+[\\s\\W_]*[a@4]+[\\s\\W_]*r+[\\s\\W_]*d+[\\s\\W_]*[e3]+[\\s\\W_]*d+)(?:\\W|$)",
        flags: "i",
        label: "R-word",
      },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 3,
  },

  // ── Specific Content Filters ───────────────────────────────

  {
    id: "mpreg-blocker",
    name: "Mpreg Emote Blocker",
    description: "Block the mpreg emoji/emote in messages, reactions, and emoji names — text references and Unicode pregnant man",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "<(?:a?):mpreg(?:_[\\w]*)?:(\\d+)>", flags: "i", label: "Custom :mpreg: emote" },
      { regex: "\\bmpreg\\b", flags: "i", label: "mpreg text mention" },
      { regex: "\\u{1FAC3}", flags: "u", label: "Pregnant man emoji (🫃)" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 2,
  },
  {
    id: "mpreg-reaction-blocker",
    name: "Mpreg Reaction Blocker",
    description: "Remove mpreg emoji when used as a reaction",
    target: AutomodTarget.REACTION_EMOJI,
    patterns: [
      { regex: "mpreg", flags: "i", label: "Custom :mpreg: reaction" },
      { regex: "\\u{1FAC3}", flags: "u", label: "Pregnant man reaction (🫃)" },
    ],
    matchMode: "any",
    actions: [AutomodAction.REMOVE_REACTION, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "mpreg-emoji-blocker",
    name: "Mpreg Emoji in Messages",
    description: "Block messages containing mpreg-related emoji (inline emoji scanning)",
    target: AutomodTarget.MESSAGE_EMOJI,
    patterns: [
      { regex: "mpreg", flags: "i", label: "Custom :mpreg: in message" },
      { regex: "\\u{1FAC3}", flags: "u", label: "Pregnant man emoji in message (🫃)" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 2,
  },

  // ── Spam & Phishing ────────────────────────────────────────

  {
    id: "phishing-links",
    name: "Phishing Links",
    description: "Block known phishing/scam domains targeting Discord users (free nitro, steam scams, etc.)",
    target: AutomodTarget.LINK,
    patterns: [
      { regex: "https?:\\/\\/(?:[\\w-]+\\.)*(?:dlscord|disc0rd|discard|discorcl|dlsc0rd|d1scord|discorde)\\.[\\w]+", flags: "i", label: "Discord typosquat domain" },
      { regex: "https?:\\/\\/(?:[\\w-]+\\.)*(?:steampowered|steamcommunlty|steamcommurnity|stearnpowered|steancommunity|steamcornmunity)\\.[\\w]+", flags: "i", label: "Steam typosquat domain" },
      { regex: "free[\\s-]*nitro|nitro[\\s-]*free|gift[\\s-]*nitro|steam[\\s-]*gift", flags: "i", label: "Free Nitro / Steam gift scam text" },
      { regex: "https?:\\/\\/(?:[\\w-]+\\.)*(?:grabify|iplogger|2no|ipgrabber|blasze|iplis)\\.[\\w]+", flags: "i", label: "IP logger domain" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 5,
  },
  {
    id: "spam-repeated-messages",
    name: "Repeated Message Spam",
    description: "Detect copy-pasted repeated words and phrases (4+ consecutive duplicates)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "(\\b\\w{3,}\\b)(?:\\s+\\1){3,}", flags: "i", label: "4+ repeated words" },
      { regex: "(.{15,})\\1{2,}", flags: "s", label: "Repeated phrases (15+ chars)" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 2,
  },
  {
    id: "spam-emote-flood",
    name: "Emote Flood",
    description: "Detect messages with excessive custom emotes (8+ in a single message)",
    target: AutomodTarget.MESSAGE_EMOJI,
    patterns: [{ regex: "(<a?:[\\w]+:\\d+>.*){8,}", flags: "s", label: "8+ custom emotes" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "spam-newlines",
    name: "Newline Spam",
    description: "Detect messages with excessive blank lines (10+ consecutive newlines)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "(\\n\\s*){10,}", flags: "", label: "10+ consecutive newlines" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },

  // ── Nickname & Username Filters ────────────────────────────

  {
    id: "nickname-hoisting",
    name: "Nickname Hoisting",
    description: "Detect nicknames starting with special characters to appear at the top of the member list",
    target: AutomodTarget.NICKNAME,
    patterns: [{ regex: "^[!\"#$%&'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~\\s]", flags: "", label: "Starts with special char" }],
    matchMode: "any",
    actions: [AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "nickname-profanity",
    name: "Nickname Profanity",
    description: "Block inappropriate words in nicknames and display names",
    target: AutomodTarget.NICKNAME,
    patterns: [
      { regex: "n+[\\W_]*[i1!|l]+[\\W_]*[gq9]+[\\W_]*[gq9]+", flags: "i", label: "Racial slur in name" },
      { regex: "f+[\\W_]*[a@4]+[\\W_]*[gq9]+", flags: "i", label: "Homophobic slur in name" },
      { regex: "c+[\\W_]*[u]+[\\W_]*n+[\\W_]*t+", flags: "i", label: "C-word in name" },
    ],
    matchMode: "any",
    actions: [AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 3,
  },

  // ── NSFW & Inappropriate Content ───────────────────────────

  {
    id: "nsfw-text",
    name: "NSFW Text Filter",
    description: "Block explicit sexual content in messages (terms and phrases)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "(?:^|\\W)(?:p[o0]rn(?:hub)?|h[e3]nt[a@4]i|xxx|xvideos|xnxx|r34|rule\\s*34|e621|nhentai)(?:\\W|$)", flags: "i", label: "NSFW site/term" },
      { regex: "(?:^|\\W)(?:d[i1!]ck\\s*pic|nudes?\\s*(?:send|dm|trade)|s[e3]nd\\s*nud[e3]s)(?:\\W|$)", flags: "i", label: "Soliciting NSFW content" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 3,
  },

  // ── Self-harm & Threats ────────────────────────────────────

  {
    id: "threats-violence",
    name: "Threats & Violence",
    description: "Detect death threats, doxxing threats, and violent language",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      {
        regex: "(?:i(?:'?(?:ll|m\\s*(?:go(?:nna|ing\\s*to))))|we(?:'?(?:ll|\\s*(?:are\\s*)?gonna))?)\\s*(?:kill|murder|shoot|stab|bomb|dox+|swat)\\s*(?:you|u|ur|yo)",
        flags: "i",
        label: "Direct threat",
      },
      { regex: "\\b(?:k+[\\W_]*y+[\\W_]*s+|kill\\s*your\\s*self)\\b", flags: "i", label: "KYS / self-harm encouragement" },
      { regex: "\\b(?:dox+(?:ed|ing)?|swat+(?:ed|ing)?)\\b", flags: "i", label: "Doxxing/swatting reference" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 5,
  },
];

/**
 * Get a preset by its ID.
 */
export function getPreset(presetId: string): PresetDefinition | undefined {
  return PRESETS.find((p) => p.id === presetId);
}

/**
 * Get all presets.
 */
export function getAllPresets(): PresetDefinition[] {
  return PRESETS;
}
