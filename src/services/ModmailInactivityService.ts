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
          ],
        },
        {
          $set: {
            inactivityWarningHours: getInactivityWarningHours(),
            autoCloseHours: getAutoCloseHours(),
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
      const warningHours = config?.inactivityWarningHours || getInactivityWarningHours();
      const autoCloseHours = config?.autoCloseHours || getAutoCloseHours();

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
        // If marked as resolved, only handle auto-closing after 24 hours
        // Skip all other inactivity processing (warnings, regular auto-close)
        const hoursSinceResolved =
          (now.getTime() - new Date(modmail.resolvedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceResolved >= 24) {
          await this.autoCloseResolvedModmail(modmail);
        }
        // Exit early - don't process any other inactivity logic for resolved threads
        return;
      }

      // Only process regular inactivity logic if NOT marked as resolved
      // Check if we should send inactivity warning
      if (!modmail.inactivityNotificationSent && hoursSinceLastActivity >= warningHours) {
        await this.sendInactivityWarning(modmail);
        return;
      }

      // Check if we should auto-close
      if (modmail.inactivityNotificationSent) {
        const hoursSinceWarning =
          (now.getTime() - new Date(modmail.inactivityNotificationSent).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceWarning >= autoCloseHours) {
          await this.autoCloseModmail(modmail);
        }
      }
    } catch (error) {
      log.error(`Error processing modmail ${modmail._id} for inactivity:`, error);
    }
  }

  /**
   * Send inactivity warning to user and thread
   */
  private async sendInactivityWarning(modmail: ModmailDoc): Promise<void> {
    try {
      log.info(`Sending inactivity warning for modmail ${modmail._id}`);
      const warningEmbed = BasicEmbed(
        this.client,
        "🕐 Modmail Inactivity Notice",
        `Your modmail thread has been inactive for ${formatTimeHours(
          getInactivityWarningHours()
        )}. If you no longer need assistance, you can close this thread using the button below.\n\n` +
          `**This thread will be automatically closed in ${formatTimeHours(
            getAutoCloseHours()
          )} if there's no further activity.**\n\n` +
          `If you still need help, simply send another message and we'll continue assisting you.`,
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
        await this.db.findOneAndUpdate(
          Modmail,
          { _id: modmail._id },
          {
            inactivityNotificationSent: new Date(),
            autoCloseScheduledAt: new Date(Date.now() + getAutoCloseHours() * 60 * 60 * 1000),
          },
          { upsert: false, new: true }
        );

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
  private async autoCloseModmail(modmail: ModmailDoc): Promise<void> {
    try {
      log.info(`Auto-closing inactive modmail ${modmail._id}`);

      // Send closure message using the consistent styling
      const reason = `Auto-closed due to ${formatTimeHours(
        getAutoCloseHours()
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
   * Close a modmail thread (following the same pattern as closeModmail.ts)
   */
  private async closeModmailThread(modmail: ModmailDoc, reason: string): Promise<void> {
    try {
      const { ThingGetter } = require("../utils/TinyUtils");
      const { handleTag } = require("../events/messageCreate/gotMail");
      const getter = new ThingGetter(this.client);

      // Get the thread
      const forumThread = await getter.getChannel(modmail.forumThreadId);

      if (!forumThread || !("setLocked" in forumThread)) {
        log.warn(`Thread ${modmail.forumThreadId} not found or not a thread channel`);
        // Still proceed with database cleanup
      } else {
        // Check if thread is already archived
        if (forumThread.archived) {
          log.debug(`Thread ${modmail.forumThreadId} is already archived, skipping operations`);
        } else {
          // Update tags BEFORE archiving (following closeModmail.ts pattern)
          try {
            const config = await ModmailCache.getModmailConfig(modmail.guildId, this.db);
            if (config) {
              const forumChannel = await getter.getChannel(config.forumChannelId);
              if (forumChannel) {
                await handleTag(null, config, this.db, forumThread, forumChannel);
              }
            }
          } catch (error) {
            log.warn(`Failed to update tags for thread ${modmail.forumThreadId}:`, error);
            // Continue with archiving even if tag update fails
          }

          // Now lock and archive the thread
          try {
            await forumThread.setLocked(true, `Auto-closed: ${reason}`);
            await forumThread.setArchived(true, `Auto-closed: ${reason}`);
            log.debug(`Successfully locked and archived thread ${modmail.forumThreadId}`);
          } catch (error: any) {
            log.warn(`Failed to lock/archive thread ${modmail.forumThreadId}:`, error);
            // If archiving fails, that's okay - the thread might already be archived
            if (error.code === 50083) {
              log.debug(`Thread ${modmail.forumThreadId} was already archived`);
            }
          }
        }
      }

      // Mark modmail as closed instead of deleting
      await this.db.findOneAndUpdate(Modmail, 
        { _id: modmail._id },
        {
          isClosed: true,
          closedAt: new Date(),
          closedBy: "system",
          closedReason: reason
        }
      );

      // Clean cache
      const env = require("../utils/FetchEnvs").default();
      await this.db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);

      log.debug(`Successfully cleaned up modmail ${modmail._id} from database`);
    } catch (error) {
      log.error(`Error in closeModmailThread for ${modmail._id}:`, error);
    }
  }
}
