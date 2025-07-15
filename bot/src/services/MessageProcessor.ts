import { Attachment, InteractionReplyOptions } from "discord.js";
import { MessageProcessorResult, DiscohookData } from "../types/MessageTypes";
import { debugMsg, fetchWithRedirectCheck } from "../utils/TinyUtils";
import DownloadFile from "../utils/DownloadFile";
import DeleteFile from "../utils/DeleteFile";
import { readFileSync } from "fs";
import FetchEnvs from "../utils/FetchEnvs";
import log from "../utils/log";

interface ContentResult {
  success: boolean;
  error?: string;
  data?: string;
}

/**
 * Service for processing message data from various sources
 * Handles Discohook links, text files, and JSON content
 */
export class MessageProcessor {
  private static readonly VALID_HOSTS = ["discohook.org", "share.discohook.app", "shrt.zip"];
  private static readonly env = FetchEnvs();

  /**
   * Process message data from either an attachment or short link
   * @param attachment Discord attachment with message data
   * @param shortLink URL to message data
   * @returns Processed message data ready for sending/editing
   */
  public static async processMessage(
    attachment?: Attachment | null,
    shortLink?: string | null
  ): Promise<MessageProcessorResult> {
    try {
      // Validate inputs
      if (shortLink && attachment) {
        return { success: false, error: "Cannot use both shortlink and attachment" };
      }

      if (!shortLink && !attachment) {
        return { success: false, error: "Must provide either shortlink or attachment" };
      }

      // Get raw content
      const contents = await this.getContents(attachment, shortLink);
      if (!contents.success || !contents.data) {
        return { success: false, error: contents.error || "Failed to get contents" };
      }

      // Parse content into message data
      const messageData = await this.parseContents(contents.data);
      if (!messageData.success || !messageData.data) {
        return { success: false, error: messageData.error || "Failed to parse contents" };
      }

      return {
        success: true,
        data: messageData.data as InteractionReplyOptions,
      };
    } catch (error) {
      log.error(`Message processing error: ${error}`);
      return { success: false, error: `Failed to process message: ${error}` };
    }
  }

  /**
   * Upload JSON data as a text file to create a short link
   * @param data Object to upload as JSON
   * @returns Shortened URL
   */
  public static async uploadJson(data: object): Promise<string> {
    try {
      // Convert object to formatted JSON string
      const jsonString = JSON.stringify(data, null, 2);

      // Create form data for multipart upload
      const formData = new FormData();
      const blob = new Blob([jsonString], { type: "application/json" });
      formData.append("file", blob, "text.json");

      // Log the attempt
      log.info(`Uploading JSON data of length ${jsonString.length}`);

      // Make the request
      const response = await fetch(`${this.env.ZIPLINE_BASEURL}/api/upload`, {
        method: "POST",
        headers: {
          Authorization: this.env.ZIPLINE_TOKEN,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      debugMsg(`Short link creation response: ${JSON.stringify(result)}`);

      // The API returns the URL in the files array
      if (result.files?.[0]?.url) {
        return result.files[0].url;
      } else if (result.url) {
        return result.url;
      } else {
        throw new Error(
          `Invalid response format from URL shortener API: ${JSON.stringify(result)}`
        );
      }
    } catch (error) {
      log.error(`Short link creation failed: ${error}`);
      throw new Error(
        `Failed to create short link: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieve contents from either an attachment or short link
   * @param attachment Discord attachment with message data
   * @param shortLink URL to message data
   * @returns Raw content as string
   */
  private static async getContents(
    attachment?: Attachment | null,
    shortLink?: string | null
  ): Promise<ContentResult> {
    try {
      if (shortLink) {
        return await this.processShortLink(shortLink);
      }

      if (attachment) {
        return await this.processAttachment(attachment);
      }

      return { success: false, error: "No valid input provided" };
    } catch (error) {
      return { success: false, error: `Content processing error: ${error}` };
    }
  }
  /**
   * Process a short link to retrieve its content
   * @param shortLink URL to message data
   * @returns Raw content as string
   */
  private static async processShortLink(shortLink: string): Promise<ContentResult> {
    try {
      const url = new URL(shortLink);
      if (!this.VALID_HOSTS.includes(url.hostname)) {
        return { success: false, error: "Invalid short link domain" };
      }

      // Fetch the actual content from the URL
      const response = await fetch(shortLink);
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch content: ${response.status} ${response.statusText}`,
        };
      }
      const contentType = response.headers.get("content-type");
      const content = await response.text();

      // Check if the response is HTML
      if (
        contentType?.includes("text/html") ||
        content.trim().startsWith("<!DOCTYPE") ||
        content.trim().startsWith("<html")
      ) {
        return {
          success: false,
          error:
            "URL returned HTML page instead of JSON data. Please ensure the URL points directly to JSON content.",
        };
      }

      // Check if it's valid JSON or text content
      if (!contentType?.includes("application/json") && !contentType?.includes("text/")) {
        return { success: false, error: "URL must return JSON or text content" };
      }

      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: `Invalid short link: ${error}` };
    }
  }

  /**
   * Process an attachment to retrieve its content
   * @param attachment Discord attachment with message data
   * @returns Raw content as string
   */
  private static async processAttachment(attachment: Attachment): Promise<ContentResult> {
    if (!attachment.contentType?.includes("text")) {
      return { success: false, error: "Attachment must be text file" };
    }

    try {
      const path = `/tmp/${attachment.name}-${Date.now()}`;
      await DownloadFile(new URL(attachment.url), path, "txt");

      const contents = readFileSync(`${path}.txt`, "utf8");
      DeleteFile(path, "txt");

      return { success: true, data: contents };
    } catch (error) {
      return { success: false, error: `Failed to process attachment: ${error}` };
    }
  }
  /**
   * Parse raw content into message data
   * @param contents Raw content as string
   * @returns Parsed message data
   */
  private static async parseContents(contents: string): Promise<MessageProcessorResult> {
    try {
      log.debug(`Starting to parse contents: ${contents.substring(0, 100)}...`);

      if (contents.startsWith("https://discohook.org/?data=")) {
        log.debug("Detected Discohook URL format");
        contents = contents.replace("https://discohook.org/?data=", "");
        log.debug(`Extracted base64 data: ${contents.substring(0, 50)}...`);

        const jsonString = Buffer.from(contents, "base64").toString("utf8");
        log.debug(`Decoded JSON string: ${jsonString.substring(0, 100)}...`);

        const data = JSON.parse(jsonString) as DiscohookData;
        log.debug(`Parsed Discohook data with ${data.messages?.length || 0} messages`);

        return {
          success: true,
          data: data.messages[0].data as InteractionReplyOptions,
        };
      }

      log.debug("Attempting to parse as direct JSON content");
      const data = JSON.parse(contents);
      log.debug(
        `Parsed direct JSON data with content: ${
          data.content !== undefined ? "present" : "missing"
        }, embeds: ${data.embeds?.length || 0}`
      );

      // Check if the JSON is already in Discord message format
      if (
        data.hasOwnProperty("content") ||
        data.hasOwnProperty("embeds") ||
        data.hasOwnProperty("attachments")
      ) {
        log.debug("Detected Discord message format JSON");
        return {
          success: true,
          data: data as InteractionReplyOptions,
        };
      }

      // Fallback: try to structure the data if it's not in the expected format
      return {
        success: true,
        data: {
          content: data.content,
          embeds: data.embeds,
        } as InteractionReplyOptions,
      };
    } catch (error) {
      log.debug(`Failed to parse contents: ${error}`);

      // Check if the error is due to trying to parse HTML as JSON
      if (
        (error instanceof SyntaxError && contents.trim().startsWith("<!DOCTYPE")) ||
        contents.trim().startsWith("<html")
      ) {
        return {
          success: false,
          error:
            "Content appears to be HTML instead of JSON. Please provide a direct link to JSON data.",
        };
      }

      // Check if it looks like HTML based on common HTML patterns
      if (
        error instanceof SyntaxError &&
        (contents.includes("<html>") || contents.includes("<!DOCTYPE html>"))
      ) {
        return {
          success: false,
          error:
            "Content appears to be an HTML webpage instead of JSON data. Please provide a direct link to JSON data.",
        };
      }

      return {
        success: false,
        error: "Invalid message data format. Please ensure the content is valid JSON.",
      };
    }
  }
}
