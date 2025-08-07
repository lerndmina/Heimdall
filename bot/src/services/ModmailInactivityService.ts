import { Client, EmbedBuilder } from "discord.js";
import Database from "../utils/data/database";
import Modmail, { ModmailType } from "../models/Modmail";
import ModmailConfig, { ModmailConfigType } from "../models/ModmailConfig";
import {
  sendMessageToBothChannels,
  createCloseThreadButton,
  getInactivityWarningHours,
  getAutoCloseHours,
  formatTimeHours,
  sendModmailCloseMessage,
} from "../utils/ModmailUtils";
import BasicEmbed from "../utils/BasicEmbed";
import log from "../utils/log";
import { redisClient } from "../Bot";
import ModmailCache from "../utils/ModmailCache";
import { closeModmailThreadSafe } from "../utils/modmail/ModmailThreads";

// Extended types that include MongoDB document fields
type ModmailDoc = ModmailType & { _id: string; createdAt?: Date; updatedAt?: Date };

export class ModmailInactivityService {
  private client: Client<true>;
  private db: Database;
  private migrationCompleted: boolean = false;

  constructor(client: Client<true>) {
    this.client = client;
    this.db = new Database();
  }

  /**
   * Migrate old modmail threads to support inactivity tracking
   */
  private async migrateOldModmails(): Promise<void> {
    if (this.migrationCompleted) {
      return;
    }

    try {
      log.info("Checking for old modmail threads to migrate...");

      // Update modmails that don't have the new fields
      const modmailUpdateResult = await Modmail.updateMany(
        {
          $or: [{ lastUserActivityAt: { $exists: false } }, { lastUserActivityAt: null }],
        },
        {
          $set: {
            lastUserActivityAt: new Date(),
            inactivityNotificationSent: null,
            autoCloseScheduledAt: null,
          },
        }
      );

      if (modmailUpdateResult.modifiedCount > 0) {
        log.info(`Successfully migrated ${modmailUpdateResult.modifiedCount} modmail threads`);
      } else {
        log.debug("No old modmail threads found to migrate");
      }

      // Update modmail configs that don't have the new fields
      const configsToUpdate = await ModmailConfig.find({
        $or: [
          { inactivityWarningHours: { $exists: false } },
          { autoCloseHours: { $exists: false } },
        ],
      })
        .select("guildId")
        .lean();

      const configUpdateResult = await ModmailConfig.updateMany(
        {
          $or: [
            { inactivityWarningHours: { $exists: false } },
            { autoCloseHours: { $exists: false } },
            { enableInactivityWarning: { $exists: false } },
            { enableAutoClose: { $exists: false } },
          ],
        },
        {
          $set: {
            inactivityWarningHours: getInactivityWarningHours(),
            autoCloseHours: getAutoCloseHours(),
            enableInactivityWarning: false, // Default to disabled for existing configs
            enableAutoClose: false, // Default to disabled for existing configs
          },
        }
      );

      if (configUpdateResult.modifiedCount > 0) {
        log.info(`Successfully migrated ${configUpdateResult.modifiedCount} modmail configs`);

        // Invalidate cache for all updated configs
        const cacheInvalidationPromises = configsToUpdate.map((config) =>
          ModmailCache.invalidateModmailConfig(config.guildId)
        );
        await Promise.allSettled(cacheInvalidationPromises);
        log.debug(`Invalidated modmail config cache for ${configsToUpdate.length} guilds`);
      } else {
        log.debug("No old modmail configs found to migrate");
      }

      this.migrationCompleted = true;
      log.info("Modmail migration completed successfully");
    } catch (error) {
      log.error("Failed to migrate old modmail data:", error);
      // Don't fail completely, just log the error
    }
  }
  /**
   * Update the last activity timestamp for a modmail thread
   */
  async updateLastActivity(modmailId: string): Promise<void> {
    try {
      await this.db.findOneAndUpdate(
        Modmail,
        { _id: modmailId },
        {
          lastUserActivityAt: new Date(),
          // Reset notification tracking when user becomes active again
          inactivityNotificationSent: null,
          autoCloseScheduledAt: null,
        },
        { upsert: false, new: true }
      );

      // Remove from Redis scheduling if it exists
      await redisClient.del(`modmail_warning_${modmailId}`);
      await redisClient.del(`modmail_autoclose_${modmailId}`);

      log.debug(`Updated last activity for modmail ${modmailId}`);
    } catch (error) {
      log.error(`Failed to update last activity for modmail ${modmailId}:`, error);
    }
  }
  /**
   * Check for inactive modmail threads and process them
   */
  async checkInactiveModmails(): Promise<void> {
    try {
      // Run migration first if not completed
      await this.migrateOldModmails();

      log.debug("Checking for inactive modmail threads...");

      // Find all active modmail threads using direct Mongoose query
      // We need to find modmails that are not closed (assuming they have some active status)
      const activeModmails = await Modmail.find({ isClosed: false }).lean();

      if (!activeModmails || activeModmails.length === 0) {
        log.debug("No active modmail threads found");
        return;
      }

      log.debug(`Found ${activeModmails.length} active modmail thread(s) to check`);

      for (const modmail of activeModmails) {
        // Convert ObjectId to string for our extended type
        const modmailDoc: ModmailDoc = {
          ...modmail,
          _id: modmail._id.toString(),
        };

        // Add specific logging for resolved modmails
        if (modmailDoc.markedResolved) {
          log.info(
            `Processing resolved modmail ${modmailDoc._id} - resolved at ${modmailDoc.resolvedAt}, scheduled close at ${modmailDoc.autoCloseScheduledAt}`
          );
        }

        await this.processModmailInactivity(modmailDoc);
      }
    } catch (error) {
      log.error("Error checking inactive modmails:", error);
    }
  }
  /**
   * Process a single modmail for inactivity
   */
  private async processModmailInactivity(modmail: ModmailDoc): Promise<void> {
    try {
      // Double-check that this modmail still exists in the database
      // (to avoid processing already closed modmails)
      const existingModmail = await this.db.findOne(Modmail, { _id: modmail._id });
      if (!existingModmail) {
        log.debug(`Modmail ${modmail._id} no longer exists in database, skipping processing`);
        return;
      } // PERMANENT INACTIVITY BLOCKING: Check if auto-close is permanently disabled for this modmail
      // This is set by the /modmail neverautoclose command and completely disables ALL inactivity processing
      if (modmail.autoCloseDisabled) {
        log.debug(
          `Modmail ${modmail._id} has auto-close permanently disabled, skipping all inactivity processing`
        );
        return;
      }

      const now = new Date();
      const lastActivity = new Date(modmail.lastUserActivityAt || modmail.createdAt || now);

      // Get config for this guild
      const config = await ModmailCache.getModmailConfig(modmail.guildId, this.db);

      // Check if inactivity features are disabled in guild config
      if (config && config.enableInactivityWarning === false && config.enableAutoClose === false) {
        log.debug(
          `Modmail ${modmail._id} has both inactivity warning and auto-close disabled in guild config, skipping inactivity processing`
        );
        return;
      }

      const warningHours = getInactivityWarningHours(config);
      const autoCloseHours = getAutoCloseHours(config);

      const hoursSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      log.debug(
        `Modmail ${modmail._id}: ${hoursSinceLastActivity.toFixed(2)} hours since last activity`
      );

      // TEMPORARY INACTIVITY BLOCKING: Check if thread is marked as resolved
      // This is a temporary state that blocks warnings but allows auto-close after 24 hours
      if (modmail.markedResolved && modmail.resolvedAt) {
        log.debug(
          `Modmail ${modmail._id} is marked as resolved, checking for 24-hour auto-close only`
        );

        const resolvedTime = new Date(modmail.resolvedAt);
        const hoursSinceResolved = (now.getTime() - resolvedTime.getTime()) / (1000 * 60 * 60);

        // Check if there has been any USER activity since the resolution
        // Staff activity doesn't prevent auto-close, only user activity does
        const userActivityAfterResolution =
          modmail.messages?.some((msg) => {
            const messageTime = new Date(msg.createdAt);
            return messageTime > resolvedTime && msg.type === "user";
          }) || false;

        // Also check if lastUserActivityAt is after resolution time
        const lastUserActivityTime = new Date(
          modmail.lastUserActivityAt || modmail.createdAt || now
        );
        const userActivityTimeAfterResolution = lastUserActivityTime > resolvedTime;

        if (userActivityAfterResolution || userActivityTimeAfterResolution) {
          log.debug(
            `Modmail ${modmail._id} has user activity after resolution (messages: ${userActivityAfterResolution}, activity time: ${userActivityTimeAfterResolution}), skipping auto-close`
          );
          return;
        }

        // Check if auto-close is scheduled and past due
        if (modmail.autoCloseScheduledAt) {
          const scheduledCloseTime = new Date(modmail.autoCloseScheduledAt);
          if (now >= scheduledCloseTime) {
            log.info(
              `Modmail ${
                modmail._id
              } is past scheduled auto-close time (${scheduledCloseTime.toISOString()}), proceeding with auto-close`
            );
            await this.autoCloseResolvedModmail(modmail);
            return;
          } else {
            log.debug(
              `Modmail ${
                modmail._id
              } has scheduled auto-close at ${scheduledCloseTime.toISOString()}, waiting`
            );
            return;
          }
        }

        // Fallback: If no scheduled time but resolved for 24+ hours, auto-close
        if (hoursSinceResolved >= 24) {
          log.info(
            `Modmail ${modmail._id} resolved for ${hoursSinceResolved.toFixed(
              2
            )} hours, auto-closing`
          );
          await this.autoCloseResolvedModmail(modmail);
        } else {
          log.debug(
            `Modmail ${modmail._id} resolved for ${hoursSinceResolved.toFixed(
              2
            )} hours, waiting for 24 hour mark`
          );
        }

        // Exit early - don't process any other inactivity logic for resolved threads
        return;
      }

      // Only process regular inactivity logic if NOT marked as resolved
      // Check if we should send inactivity warning
      if (
        config?.enableInactivityWarning !== false &&
        !modmail.inactivityNotificationSent &&
        hoursSinceLastActivity >= warningHours
      ) {
        await this.sendInactivityWarning(modmail, config);
        return;
      }

      // Check if we should auto-close
      if (config?.enableAutoClose !== false && modmail.inactivityNotificationSent) {
        const hoursSinceWarning =
          (now.getTime() - new Date(modmail.inactivityNotificationSent).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceWarning >= autoCloseHours) {
          await this.autoCloseModmail(modmail, config);
        }
      }
    } catch (error) {
      log.error(`Error processing modmail ${modmail._id} for inactivity:`, error);
    }
  }

  /**
   * Send inactivity warning to user and thread
   */
  private async sendInactivityWarning(modmail: ModmailDoc, config?: any): Promise<void> {
    try {
      log.info(`Sending inactivity warning for modmail ${modmail._id}`);

      const warningHours = getInactivityWarningHours(config);
      const autoCloseHours = getAutoCloseHours(config);
      const autoCloseEnabled = config?.enableAutoClose !== false;

      // Build the warning message conditionally based on auto-close setting
      let warningMessage = `Your modmail thread has been inactive for ${formatTimeHours(
        warningHours
      )}. If you no longer need assistance, you can close this thread using the button below.\n\n`;

      if (autoCloseEnabled) {
        warningMessage += `**This thread will be automatically closed in ${formatTimeHours(
          autoCloseHours
        )} if there's no further activity.**\n\n`;
      } else {
        warningMessage += `**Auto-close is disabled for this server, so this thread will remain open until manually closed.**\n\n`;
      }

      warningMessage += `If you still need help, simply send another message and we'll continue assisting you.`;

      const warningEmbed = BasicEmbed(
        this.client,
        "🕐 Modmail Inactivity Notice",
        warningMessage,
        undefined,
        "Yellow"
      );

      const closeButton = createCloseThreadButton();
      const { dmSuccess, threadSuccess } = await sendMessageToBothChannels(
        this.client,
        modmail,
        warningEmbed,
        undefined,
        { dmComponents: [closeButton], threadComponents: [closeButton] }
      );

      if (dmSuccess || threadSuccess) {
        // Update the modmail to mark that notification was sent
        const updateData: any = {
          inactivityNotificationSent: new Date(),
        };

        // Only set autoCloseScheduledAt if auto-close is enabled
        if (autoCloseEnabled) {
          updateData.autoCloseScheduledAt = new Date(Date.now() + autoCloseHours * 60 * 60 * 1000);
        }

        await this.db.findOneAndUpdate(Modmail, { _id: modmail._id }, updateData, {
          upsert: false,
          new: true,
        });

        log.info(`Inactivity warning sent for modmail ${modmail._id}`);
      } else {
        log.warn(
          `Failed to send inactivity warning for modmail ${modmail._id} - no channels accessible`
        );
      }
    } catch (error) {
      log.error(`Error sending inactivity warning for modmail ${modmail._id}:`, error);
    }
  }

  /**
   * Auto-close an inactive modmail thread
   */
  private async autoCloseModmail(modmail: ModmailDoc, config?: any): Promise<void> {
    try {
      log.info(`Auto-closing inactive modmail ${modmail._id}`);

      const autoCloseHours = getAutoCloseHours(config);

      // Send closure message using the consistent styling
      const reason = `Auto-closed due to ${formatTimeHours(
        autoCloseHours
      )} of inactivity after the warning was sent.`;
      await sendModmailCloseMessage(this.client, modmail, "System", "Auto-Close System", reason);

      // Close the modmail using existing close logic
      await this.closeModmailThread(modmail, "Auto-closed due to inactivity");

      log.info(`Successfully auto-closed modmail ${modmail._id}`);
    } catch (error) {
      log.error(`Error auto-closing modmail ${modmail._id}:`, error);
    }
  }

  /**
   * Auto-close a resolved modmail thread after 24 hours
   */
  private async autoCloseResolvedModmail(modmail: ModmailDoc): Promise<void> {
    try {
      log.info(`Auto-closing resolved modmail ${modmail._id}`);

      // Send closure message using the consistent styling
      const reason = "Auto-closed after 24 hours with no response to resolution";
      await sendModmailCloseMessage(this.client, modmail, "System", "Auto-Close System", reason);

      // Close the modmail using existing close logic
      await this.closeModmailThread(modmail, reason);

      log.info(`Successfully auto-closed resolved modmail ${modmail._id}`);
    } catch (error) {
      log.error(`Error auto-closing resolved modmail ${modmail._id}:`, error);
    }
  }

  /**
   * Close a modmail thread using the centralized utility
   */
  private async closeModmailThread(modmail: ModmailDoc, reason: string): Promise<void> {
    try {
      // Use the centralized close utility
      const closeResult = await closeModmailThreadSafe(this.client, {
        modmailId: modmail._id,
        reason,
        closedBy: {
          type: "System",
          username: "Auto-close System",
          userId: "system",
        },
        lockAndArchive: true,
        sendCloseMessage: true,
        updateTags: true,
      });

      if (!closeResult.success) {
        log.error(`Failed to close modmail ${modmail._id}:`, closeResult.error);
      } else {
        log.debug(`Successfully closed modmail ${modmail._id} via auto-close`);
      }
    } catch (error) {
      log.error(`Error in closeModmailThread for ${modmail._id}:`, error);
    }
  }
}
