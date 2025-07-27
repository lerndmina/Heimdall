import Database from "../data/database";
import Modmail from "../../models/Modmail";
import { TicketPriority } from "../../models/ModmailConfig";
import { tryCatch } from "../trycatch";
import log from "../log";

/**
 * Utility class for managing ticket numbering and naming conventions
 * 
 * New thread naming format: 🔸 #1234 | username | claimedStaff
 * - Priority emoji at the start for easy visual identification
 * - Auto-incrementing ticket numbers per guild
 * - No category name since each category has its own forum channel
 */
export class TicketNumbering {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  /**
   * Get the next available ticket number for a guild
   * @param guildId - The guild ID
   * @returns The next ticket number
   */
  async getNextTicketNumber(guildId: string): Promise<number> {
    const { data: tickets, error } = await tryCatch(
      this.db.find(Modmail, { guildId, ticketNumber: { $exists: true } })
    );

    if (error) {
      log.error(`Failed to get tickets for guild ${guildId}:`, error);
      return 1;
    }

    if (!tickets || tickets.length === 0) {
      return 1;
    }

    // Find the highest ticket number
    const maxTicketNumber = Math.max(...tickets.map((t) => t.ticketNumber || 0));
    return maxTicketNumber + 1;
  }

  /**
   * Generate a formatted ticket number with padding
   * @param ticketNumber - The raw ticket number
   * @param padding - The number of digits to pad to (default: 4)
   * @returns Formatted ticket number (e.g., "0001", "0042")
   */
  formatTicketNumber(ticketNumber: number, padding: number = 4): string {
    return ticketNumber.toString().padStart(padding, "0");
  }

  /**
   * Generate the priority indicator emoji
   * @param priority - The ticket priority
   * @returns The priority emoji
   */
  getPriorityEmoji(priority: TicketPriority): string {
    switch (priority) {
      case TicketPriority.LOW:
        return "🔹"; // Low priority - blue diamond
      case TicketPriority.MEDIUM:
        return "🔸"; // Medium priority - orange diamond
      case TicketPriority.HIGH:
        return "🔴"; // High priority - red circle
      case TicketPriority.URGENT:
        return "🚨"; // Urgent - rotating light
      default:
        return "🔸"; // Default to medium
    }
  }

  /**
   * Generate a complete thread name for a modmail ticket
   * Format: 🔸 #1234 | username | claimedStaff
   * @param options - The thread naming options
   * @returns The formatted thread name
   */
  generateThreadName(options: {
    ticketNumber: number;
    username: string;
    priority: TicketPriority;
    claimedStaffName?: string;
  }): string {
    const {
      ticketNumber,
      username,
      priority,
      claimedStaffName = "unknown",
    } = options;

    const DISCORD_MAX_THREAD_NAME = 100;

    const formattedNumber = this.formatTicketNumber(ticketNumber);
    const priorityEmoji = this.getPriorityEmoji(priority);

    // Build the base format: 🔸 #1234 | username | claimedStaff
    const baseName = `${priorityEmoji} #${formattedNumber} | ${username} | ${claimedStaffName}`;

    // If it fits within Discord's limit, use it as is
    if (baseName.length <= DISCORD_MAX_THREAD_NAME) {
      return baseName;
    }

    // If too long, truncate the username first
    const maxUsernameLength =
      DISCORD_MAX_THREAD_NAME -
      (formattedNumber.length + claimedStaffName.length + 15); // 15 for formatting chars and emoji

    const truncatedUsername =
      username.length > maxUsernameLength
        ? username.substring(0, Math.max(3, maxUsernameLength - 3)) + "..."
        : username;

    const truncatedName = `${priorityEmoji} #${formattedNumber} | ${truncatedUsername} | ${claimedStaffName}`;

    // If still too long, truncate the claimed staff name
    if (truncatedName.length > DISCORD_MAX_THREAD_NAME) {
      const maxStaffNameLength =
        DISCORD_MAX_THREAD_NAME -
        (formattedNumber.length + truncatedUsername.length + 15);

      const truncatedStaffName =
        claimedStaffName.length > maxStaffNameLength
          ? claimedStaffName.substring(0, Math.max(3, maxStaffNameLength - 3)) + "..."
          : claimedStaffName;

      return `${priorityEmoji} #${formattedNumber} | ${truncatedUsername} | ${truncatedStaffName}`;
    }

    return truncatedName;
  }

  /**
   * Update a thread name when it's claimed by staff
   * @param currentName - The current thread name
   * @param claimedStaffName - The name of the staff member who claimed it
   * @returns The updated thread name
   */
  updateThreadNameWithClaim(currentName: string, claimedStaffName: string): string {
    // Pattern: 🔸 #1234 | username | unknown
    // Replace the last part (after the last |) with the claimed staff name
    const lastPipeIndex = currentName.lastIndexOf(" | ");

    if (lastPipeIndex === -1) {
      // Fallback if format doesn't match expected pattern
      return `${currentName} | ${claimedStaffName}`;
    }

    const baseNameWithoutStaff = currentName.substring(0, lastPipeIndex);
    return `${baseNameWithoutStaff} | ${claimedStaffName}`;
  }

  /**
   * Parse thread name to extract ticket information
   * @param threadName - The thread name to parse
   * @returns Parsed ticket information or null if parsing fails
   */
  parseThreadName(threadName: string): {
    ticketNumber?: number;
    username?: string;
    claimedStaffName?: string;
    priority?: TicketPriority;
  } | null {
    // Pattern: 🔸 #1234 | username | claimedStaff
    const match = threadName.match(/^(.+?) #(\d+) \| (.+?) \| (.+)$/);

    if (!match) {
      return null;
    }

    const priorityEmoji = match[1];
    const ticketNumber = parseInt(match[2], 10);
    const username = match[3];
    const claimedStaffName = match[4] === "unknown" ? undefined : match[4];

    // Try to determine priority from emoji
    let priority: TicketPriority = TicketPriority.MEDIUM; // Default
    switch (priorityEmoji) {
      case "🔹":
        priority = TicketPriority.LOW;
        break;
      case "🔸":
        priority = TicketPriority.MEDIUM;
        break;
      case "🔴":
        priority = TicketPriority.HIGH;
        break;
      case "🚨":
        priority = TicketPriority.URGENT;
        break;
    }

    return {
      ticketNumber,
      username,
      claimedStaffName,
      priority,
    };
  }

  /**
   * Check if a ticket number already exists for a guild
   * @param guildId - The guild ID
   * @param ticketNumber - The ticket number to check
   * @returns True if the number exists, false otherwise
   */
  async ticketNumberExists(guildId: string, ticketNumber: number): Promise<boolean> {
    const { data: ticket, error } = await tryCatch(
      this.db.findOne(Modmail, { guildId, ticketNumber })
    );

    return !error && !!ticket;
  }

  /**
   * Reserve a ticket number for a guild (useful for concurrent creation)
   * @param guildId - The guild ID
   * @returns A guaranteed unique ticket number
   */
  async reserveTicketNumber(guildId: string): Promise<number> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const nextNumber = await this.getNextTicketNumber(guildId);
      const exists = await this.ticketNumberExists(guildId, nextNumber);

      if (!exists) {
        return nextNumber;
      }

      attempts++;

      // Small delay to reduce race conditions
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Fallback: return a timestamp-based number if we can't find a unique one
    const timestamp = Date.now() % 100000; // Last 5 digits of timestamp
    log.warn(
      `Failed to reserve unique ticket number for guild ${guildId}, using timestamp: ${timestamp}`
    );
    return timestamp;
  }
}

// Export singleton instance
export default new TicketNumbering();
