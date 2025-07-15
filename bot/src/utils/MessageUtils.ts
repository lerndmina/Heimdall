import { Client, Message } from "discord.js";
import { ThingGetter } from "./TinyUtils";
import log from "./log";

/**
 * Gets a message from a URL with comprehensive error handling
 * @param client Discord client
 * @param url Message URL
 * @returns The message or null if not found
 */
export async function getMessageFromUrl(client: Client, url: string): Promise<Message | null> {
  try {
    const messageUrl = new URL(url);
    const getter = new ThingGetter(client);
    const message = await getter.getMessageFromUrl(messageUrl);
    return message;
  } catch (error) {
    log.error(`Failed to get message from URL: ${error}`);
    return null;
  }
}

/**
 * Validates a message URL and gets the message
 * @param client Discord client
 * @param url Message URL string
 * @throws Error if URL is invalid or message not found
 */
export async function validateAndGetMessage(client: Client, url: string): Promise<Message> {
  if (!url) {
    throw new Error("No message URL provided");
  }

  let messageUrl: URL;
  try {
    messageUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid message URL: ${url}`);
  }

  const message = await getMessageFromUrl(client, url);
  if (!message) {
    throw new Error("Message not found. Make sure it exists and the bot has access to it.");
  }

  return message;
}
