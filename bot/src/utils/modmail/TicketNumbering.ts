import Database from "../data/database";
import Modmail from "../../models/Modmail";
import { TicketPriority } from "../../models/ModmailConfig";
import { tryCatch } from "../trycatch";
import log from "../log";

/**
 * Utility class for managing ticket numbering and naming conventions
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
   * Format: [CATEGORY] #1234 | username | 🔸 | claimedStaff
   * @param options - The thread naming options
   * @returns The formatted thread name
   */
  generateThreadName(options: {
    categoryName: string;
    ticketNumber: number;
    username: string;
    priority: TicketPriority;
    claimedStaffName?: string;
  }): string {
    const {
      categoryName,
      ticketNumber,
      username,
      priority,
      claimedStaffName = "unknown",
    } = options;

    const DISCORD_MAX_THREAD_NAME = 100;

    const formattedNumber = this.formatTicketNumber(ticketNumber);
    const priorityEmoji = this.getPriorityEmoji(priority);

    // Build the base format: [CATEGORY] #1234 | username | 🔸 | claimedStaff
    const baseName = `[${categoryName}] #${formattedNumber} | ${username} | ${priorityEmoji} | ${claimedStaffName}`;

    // If it fits within Discord's limit, use it as is
    if (baseName.length <= DISCORD_MAX_THREAD_NAME) {
      return baseName;
    }

    // If too long, truncate the username first
    const maxUsernameLength =
      DISCORD_MAX_THREAD_NAME -
      (categoryName.length + formattedNumber.length + claimedStaffName.length + 20); // 20 for formatting chars

    const truncatedUsername =
      username.length > maxUsernameLength
        ? username.substring(0, Math.max(3, maxUsernameLength - 3)) + "..."
        : username;

    const truncatedName = `[${categoryName}] #${formattedNumber} | ${truncatedUsername} | ${priorityEmoji} | ${claimedStaffName}`;

    // If still too long, truncate the category name
    if (truncatedName.length > DISCORD_MAX_THREAD_NAME) {
      const maxCategoryLength =
        DISCORD_MAX_THREAD_NAME -
        (formattedNumber.length + truncatedUsername.length + claimedStaffName.length + 20);

      const truncatedCategory =
        categoryName.length > maxCategoryLength
          ? categoryName.substring(0, Math.max(3, maxCategoryLength - 3)) + "..."
          : categoryName;

      return `[${truncatedCategory}] #${formattedNumber} | ${truncatedUsername} | ${priorityEmoji} | ${claimedStaffName}`;
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
    // Pattern: [CATEGORY] #1234 | username | 🔸 | unknown
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
    categoryName?: string;
    ticketNumber?: number;
    username?: string;
    claimedStaffName?: string;
  } | null {
    // Pattern: [CATEGORY] #1234 | username | 🔸 | claimedStaff
    const match = threadName.match(/^\[(.+?)\] #(\d+) \| (.+?) \| .+ \| (.+)$/);

    if (!match) {
      return null;
    }

    return {
      categoryName: match[1],
      ticketNumber: parseInt(match[2], 10),
      username: match[3],
      claimedStaffName: match[4] === "unknown" ? undefined : match[4],
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
