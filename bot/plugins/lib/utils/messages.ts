/**
 * Regular footer messages for embeds
 */
export const REGULAR_MESSAGES = [
  "Heimdall is watching",
  "Guardian of the Bifrost",
  "All-seeing, all-knowing",
  "Watching over the nine realms",
  "The gatekeeper",
  "Vigilant as always",
  "Eyes that see all",
  "The eternal watchman",
];

/**
 * April Fools messages (used on April 1st)
 */
export const APRIL_FOOLS_MESSAGES = [
  "Heimdall fell asleep on the job",
  "Loki was here",
  "The Bifrost is under maintenance",
  "Heimdall took a vacation",
  "Error 404: Asgard not found",
  "Oops, dropped my sword",
  "Who let the frost giants in?",
  "Heimdall.exe has stopped working",
];

/**
 * Check if today is April 1st
 */
export function isAprilFools(date: Date = new Date()): boolean {
  return date.getMonth() === 3 && date.getDate() === 1; // Month is 0-indexed
}

/**
 * Get a random footer message for embeds
 * Uses April Fools messages on April 1st
 */
export function getRandomFooterMessage(date?: Date): string {
  const messages = isAprilFools(date) ? APRIL_FOOLS_MESSAGES : REGULAR_MESSAGES;
  return messages[Math.floor(Math.random() * messages.length)]!;
}
