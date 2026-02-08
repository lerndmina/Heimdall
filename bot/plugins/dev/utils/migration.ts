/**
 * Data Migration Utility - Import from Old Bot
 *
 * Transforms data from old bot models to new plugin-based models.
 * Handles schema differences, field renaming, and data validation.
 */

import mongoose from "mongoose";
import TempVC from "../../tempvc/models/TempVC.js";
import ActiveTempChannels from "../../tempvc/models/ActiveTempChannels.js";
import Tag from "../../tags/models/Tag.js";
import SuggestionConfig from "../../suggestions/models/SuggestionConfig.js";
import Suggestion from "../../suggestions/models/Suggestion.js";
import ModmailConfig from "../../modmail/models/ModmailConfig.js";
import Modmail from "../../modmail/models/Modmail.js";

export interface MigrationResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  details?: any;
}

export interface FullMigrationOptions {
  oldDbUri: string;
  guildId?: string;
  categoryMapping?: Record<string, string>;
  importOpenThreads?: boolean;
  skipModmail?: boolean;
  modmailCollection?: string;
  onProgress?: (event: MigrationProgressEvent) => void;
}

export interface MigrationProgressEvent {
  step: keyof MigrationStats;
  label: string;
  completed: number;
  total: number;
  result: MigrationResult;
}

export interface MigrationStats {
  tempVC: MigrationResult;
  activeTempChannels: MigrationResult;
  tags: MigrationResult;
  suggestionConfig: MigrationResult;
  suggestions: MigrationResult;
  modmailConfig: MigrationResult;
  modmail: MigrationResult;
}

/** Connect to old database (separate connection, auto-retries with different authSource) */
export async function connectOldDatabase(oldDbUri: string): Promise<mongoose.Connection> {
  // Try as-is first, then with authSource=admin, then authSource=test
  const attempts: string[] = [oldDbUri];

  // Only add fallbacks if the URI doesn't already specify authSource
  if (!oldDbUri.includes("authSource=")) {
    const separator = oldDbUri.includes("?") ? "&" : "?";
    attempts.push(`${oldDbUri}${separator}authSource=admin`);
    attempts.push(`${oldDbUri}${separator}authSource=test`);
  }

  for (let i = 0; i < attempts.length; i++) {
    try {
      const conn = mongoose.createConnection(attempts[i], {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      await conn.asPromise();
      return conn;
    } catch (err: any) {
      const isAuthError = err.code === 18 || err.message?.includes("Authentication failed");
      const isLastAttempt = i === attempts.length - 1;

      if (!isAuthError || isLastAttempt) {
        throw err;
      }
      // Auth failed, try next authSource
    }
  }

  throw new Error("Failed to connect to old database");
}

// ═══════════════════════════════════════════════════════════════════════════
// TempVC Migration
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateTempVC(oldConn: mongoose.Connection, guildId?: string): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    const OldGuildNewVC = oldConn.model(
      "GuildNewVC",
      new mongoose.Schema({
        guildID: String,
        guildChannelIDs: [{ channelID: String, categoryID: String, useSequentialNames: Boolean, channelName: String }],
      }),
    );

    const query = guildId ? { guildID: guildId } : {};
    const oldConfigs = await OldGuildNewVC.find(query).lean();

    for (const oldConfig of oldConfigs) {
      try {
        const existing = await TempVC.findOne({ guildId: oldConfig.guildID });
        if (existing) {
          result.skipped++;
          continue;
        }

        await TempVC.create({
          guildId: oldConfig.guildID,
          channels: (oldConfig.guildChannelIDs || []).map((ch: any) => ({
            channelId: ch.channelID,
            categoryId: ch.categoryID,
            useSequentialNames: ch.useSequentialNames ?? false,
            channelName: ch.channelName || "Temp VC",
          })),
        });

        result.imported++;
      } catch (err: any) {
        result.errors.push(`TempVC ${oldConfig.guildID}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(`TempVC migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ActiveTempChannels Migration
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateActiveTempChannels(oldConn: mongoose.Connection, guildId?: string): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    const OldActiveTempChannels = oldConn.model(
      "ActiveTempChanels", // Note: old model has typo "Chanels"
      new mongoose.Schema({
        guildID: String,
        channelIDs: [String],
      }),
    );

    const query = guildId ? { guildID: guildId } : {};
    const oldActive = await OldActiveTempChannels.find(query).lean();

    for (const oldDoc of oldActive) {
      try {
        const existing = await ActiveTempChannels.findOne({ guildId: oldDoc.guildID });
        if (existing) {
          result.skipped++;
          continue;
        }

        await ActiveTempChannels.create({
          guildId: oldDoc.guildID,
          channelIds: oldDoc.channelIDs || [],
        });

        result.imported++;
      } catch (err: any) {
        result.errors.push(`ActiveTempChannels ${oldDoc.guildID}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(`ActiveTempChannels migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tags Migration
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateTags(oldConn: mongoose.Connection, guildId?: string): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    const OldTagSchema = oldConn.model(
      "TagSchema",
      new mongoose.Schema({
        key: String,
        guildId: String,
        tag: String,
      }),
    );

    const query = guildId ? { guildId } : {};
    const oldTags = await OldTagSchema.find(query).lean();

    for (const oldTag of oldTags) {
      try {
        const existing = await Tag.findOne({ guildId: oldTag.guildId, name: oldTag.key });
        if (existing) {
          result.skipped++;
          continue;
        }

        await Tag.create({
          guildId: oldTag.guildId,
          name: oldTag.key,
          content: oldTag.tag,
          createdBy: "migration", // No creator info in old schema
          uses: 0,
        });

        result.imported++;
      } catch (err: any) {
        result.errors.push(`Tag ${oldTag.guildId}/${oldTag.key}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Tags migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Suggestion Config Migration
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateSuggestionConfig(oldConn: mongoose.Connection, guildId?: string): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    const OldSuggestionConfig = oldConn.model(
      "SuggestionConfig",
      new mongoose.Schema({
        guildId: String,
        channelId: String,
      }),
    );

    const query = guildId ? { guildId } : {};
    const oldConfigs = await OldSuggestionConfig.find(query).lean();

    for (const oldConfig of oldConfigs) {
      try {
        const existing = await SuggestionConfig.findOne({ guildId: oldConfig.guildId });
        if (existing) {
          result.skipped++;
          continue;
        }

        // Old config only had 1 channel, new supports multiple
        await SuggestionConfig.create({
          guildId: oldConfig.guildId,
          channels: [
            {
              channelId: oldConfig.channelId,
              mode: "embed", // Old bot only supported embed mode
              enableAiTitles: false,
              createdBy: "migration",
              createdAt: new Date(),
            },
          ],
          categories: [],
          enableCategories: false,
          updatedBy: "migration",
        });

        result.imported++;
      } catch (err: any) {
        result.errors.push(`SuggestionConfig ${oldConfig.guildId}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(`SuggestionConfig migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Suggestions Migration
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateSuggestions(oldConn: mongoose.Connection, guildId?: string): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    const OldSuggestion = oldConn.model(
      "Suggestion",
      new mongoose.Schema({
        id: String,
        guildId: String,
        messageLink: String,
        userId: String,
        suggestion: String,
        reason: String,
        title: String,
        votes: [{ userId: String, vote: String }],
        status: String,
        managedBy: String,
      }),
    );

    const query = guildId ? { guildId } : {};
    const oldSuggestions = await OldSuggestion.find(query).lean();

    for (const oldSugg of oldSuggestions) {
      try {
        const existing = await Suggestion.findOne({ id: oldSugg.id });
        if (existing) {
          result.skipped++;
          continue;
        }

        // Get channel from config
        const config = await SuggestionConfig.findOne({ guildId: oldSugg.guildId });
        const channelId = config?.channels[0]?.channelId || "unknown";

        await Suggestion.create({
          id: oldSugg.id,
          userId: oldSugg.userId,
          guildId: oldSugg.guildId,
          channelId,
          mode: "embed",
          suggestion: oldSugg.suggestion,
          reason: oldSugg.reason,
          title: oldSugg.title,
          status: oldSugg.status || "pending",
          messageLink: oldSugg.messageLink,
          votes: (oldSugg.votes || []).map((v: any) => ({
            userId: v.userId,
            vote: v.vote,
            votedAt: new Date(),
          })),
          managedBy: oldSugg.managedBy,
        });

        result.imported++;
      } catch (err: any) {
        result.errors.push(`Suggestion ${oldSugg.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Suggestions migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Modmail Config Migration (Complex - categories, webhooks, encryption)
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateModmailConfig(oldConn: mongoose.Connection, guildId?: string): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    // Try reading old modmail config - model "ModmailConfig" -> collection "modmailconfigs"
    const OldModmailConfig = oldConn.model(
      "ModmailConfig",
      new mongoose.Schema({}, { strict: false }), // Accept all fields
      "modmailconfigs",
    );

    const query = guildId ? { guildId } : {};
    const oldConfigs = await OldModmailConfig.find(query).lean();

    if (oldConfigs.length === 0) {
      result.details = { message: "No modmail config found in old database" };
      return result;
    }

    for (const oldConfig of oldConfigs) {
      try {
        const existing = await ModmailConfig.findOne({ guildId: (oldConfig as any).guildId });
        if (existing) {
          // Update nextTicketNumber if old is higher
          const oldTicketNum = (oldConfig as any).nextTicketNumber;
          if (oldTicketNum && oldTicketNum > existing.nextTicketNumber) {
            existing.nextTicketNumber = oldTicketNum;
            await existing.save();
            result.errors.push(`Updated nextTicketNumber to ${oldTicketNum} for guild ${(oldConfig as any).guildId}`);
          }
          result.skipped++;
          continue;
        }

        // Import top-level config without categories (webhooks can't transfer)
        const configData: any = {
          guildId: (oldConfig as any).guildId,
          nextTicketNumber: (oldConfig as any).nextTicketNumber || 1,
          enabled: false, // Disabled until webhooks/forum channels are set up
          categories: [], // Categories need manual setup (webhooks, forum channels)
          // Import settings that don't require channel-specific setup
          enableAutoClose: (oldConfig as any).enableAutoClose ?? true,
          autoCloseHours: (oldConfig as any).autoCloseHours || 72,
          autoCloseWarningHours: (oldConfig as any).autoCloseWarningHours || 12,
          enableInactivityWarning: (oldConfig as any).enableInactivityWarning ?? true,
          minimumMessageLength: (oldConfig as any).minimumMessageLength || 50,
          rateLimitSeconds: (oldConfig as any).rateLimitSeconds || 5,
          typingIndicators: (oldConfig as any).typingIndicators ?? true,
          allowAttachments: (oldConfig as any).allowAttachments ?? true,
          maxAttachmentSizeMB: (oldConfig as any).maxAttachmentSizeMB || 25,
          trackUserActivity: (oldConfig as any).trackUserActivity ?? true,
          trackStaffActivity: (oldConfig as any).trackStaffActivity ?? true,
          threadNamingPattern: (oldConfig as any).threadNamingPattern || "#{number} | {username} | {claimer}",
          globalStaffRoleIds: (oldConfig as any).globalStaffRoleIds || [],
        };

        await ModmailConfig.create(configData);
        result.imported++;
      } catch (err: any) {
        result.errors.push(`ModmailConfig ${(oldConfig as any).guildId}: ${err.message}`);
      }
    }

    // Count old categories for reporting
    const totalOldCategories = oldConfigs.reduce((sum, c) => sum + ((c as any).categories?.length || 0), 0);
    result.details = {
      message: "Config imported with settings preserved. Categories need manual setup via dashboard.",
      note: `${totalOldCategories} old categories found — reconfigure them in the modmail dashboard to set up forum channels and webhooks.`,
      importedSettings: ["nextTicketNumber", "autoClose", "rateLimit", "typingIndicators", "attachments", "staffRoles", "threadNaming"],
    };
  } catch (err: any) {
    result.success = false;
    result.errors.push(`ModmailConfig migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Modmail Threads Migration (Conversations, Messages)
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateModmail(
  oldConn: mongoose.Connection,
  guildId?: string,
  categoryMapping?: Record<string, string>,
  importOpenThreads: boolean = true,
  modmailCollection?: string,
): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [], details: {} };

  try {
    const modmailSchema = new mongoose.Schema({
      guildId: String,
      forumThreadId: String,
      forumChannelId: String,
      userId: String,
      userAvatar: String,
      userDisplayName: String,
      categoryId: String,
      categoryName: String,
      ticketNumber: Number,
      priority: Number,
      formResponses: [
        {
          fieldId: String,
          fieldLabel: String,
          fieldType: String,
          value: String,
        },
      ],
      createdVia: String,
      initialQuery: String,
      lastUserActivityAt: Date,
      lastStaffActivityAt: Date,
      inactivityNotificationSent: Date,
      autoCloseScheduledAt: Date,
      autoCloseDisabled: Boolean,
      markedResolved: Boolean,
      resolvedAt: Date,
      claimedBy: String,
      claimedAt: Date,
      isClosed: Boolean,
      closedAt: Date,
      closedBy: String,
      closedReason: String,
      messages: [
        {
          messageId: String,
          type: String,
          content: String,
          authorId: String,
          authorName: String,
          authorAvatar: String,
          discordMessageId: String,
          discordMessageUrl: String,
          webhookMessageId: String,
          webhookMessageUrl: String,
          dmMessageId: String,
          dmMessageUrl: String,
          attachments: [
            {
              filename: String,
              url: String,
              size: Number,
              contentType: String,
            },
          ],
          isEdited: Boolean,
          editedContent: String,
          editedAt: Date,
          editedBy: String,
          createdAt: Date,
          isDeleted: Boolean,
          deletedAt: Date,
          deletedBy: String,
        },
      ],
    });

    // Use user-specified collection name, or auto-detect from common names
    const query = guildId ? { guildId } : {};
    let oldThreads: any[] = [];
    let usedCollection = "";

    if (modmailCollection) {
      // User specified an explicit collection name
      const OldModmail = oldConn.model("CustomModmail", modmailSchema, modmailCollection);
      oldThreads = await OldModmail.find(query).lean();
      usedCollection = modmailCollection;
    } else {
      // Auto-detect: try common collection names
      const collectionsToTry = ["modmails", "solacemodmails"];
      for (let i = 0; i < collectionsToTry.length; i++) {
        try {
          const modelName = `AutoModmail${i}`;
          const Model = oldConn.model(modelName, modmailSchema, collectionsToTry[i]);
          const found = await Model.find(query).lean();
          if (found.length > 0) {
            oldThreads = found;
            usedCollection = collectionsToTry[i]!;
            break;
          }
        } catch {
          // Collection doesn't exist, try next
        }
      }
    }

    for (const oldThread of oldThreads) {
      try {
        // Skip if already exists
        const existing = await Modmail.findOne({ forumThreadId: oldThread.forumThreadId });
        if (existing) {
          result.skipped++;
          continue;
        }

        // Determine original status (for historical reference)
        let originalStatus: "open" | "resolved" | "closed" = "open";
        if (oldThread.isClosed) {
          originalStatus = "closed";
        } else if (oldThread.markedResolved) {
          originalStatus = "resolved";
        }

        // All migrated threads are closed — the old forum threads don't exist
        // in the new bot, so they can't function as open conversations.
        // The original status is preserved in the closeReason for reference.
        const status = "closed" as const;
        const wasPreviouslyOpen = originalStatus === "open" || originalStatus === "resolved";

        // Map category ID if mapping provided
        let categoryId = oldThread.categoryId;
        if (categoryMapping && oldThread.categoryId && categoryMapping[oldThread.categoryId]) {
          categoryId = categoryMapping[oldThread.categoryId];
        }

        // Transform messages
        const messages = (oldThread.messages || []).map((oldMsg: any) => {
          // Determine message context
          let context: "dm" | "thread" | "both" = "both";
          const hasDm = !!oldMsg.dmMessageId;
          const hasThread = !!oldMsg.webhookMessageId || !!oldMsg.discordMessageId;

          if (hasDm && hasThread) context = "both";
          else if (hasDm) context = "dm";
          else if (hasThread) context = "thread";

          // Map message type
          const authorType = oldMsg.type === "user" ? "user" : oldMsg.type === "staff" ? "staff" : "system";

          return {
            messageId: oldMsg.messageId,
            discordMessageId: oldMsg.webhookMessageId || oldMsg.discordMessageId,
            discordDmMessageId: oldMsg.dmMessageId,
            authorId: oldMsg.authorId,
            authorType,
            context,
            content: oldMsg.content,
            isStaffOnly: false, // Old schema didn't track this
            attachments: (oldMsg.attachments || []).map((att: any) => ({
              filename: att.filename,
              url: att.url,
              size: att.size,
              contentType: att.contentType,
              spoiler: false,
            })),
            timestamp: oldMsg.createdAt || new Date(),
            isEdited: oldMsg.isEdited || false,
            editedAt: oldMsg.editedAt,
            originalContent: oldMsg.editedContent, // Old schema stored edited content, new stores original
            isDeleted: oldMsg.isDeleted || false,
            deletedAt: oldMsg.deletedAt,
            deletedBy: oldMsg.deletedBy,
            deliveredToDm: hasDm,
            deliveredToThread: hasThread,
          };
        });

        // Calculate metrics
        const userMessages = messages.filter((m) => m.authorType === "user").length;
        const staffMessages = messages.filter((m) => m.authorType === "staff").length;
        const systemMessages = messages.filter((m) => m.authorType === "system").length;
        const totalAttachments = messages.reduce((sum, m) => sum + m.attachments.length, 0);

        await Modmail.create({
          ticketNumber: oldThread.ticketNumber,
          guildId: oldThread.guildId,
          userId: oldThread.userId,
          forumChannelId: oldThread.forumChannelId,
          forumThreadId: `migrated-${oldThread.forumThreadId}`, // Prefix to prevent orphan detection
          categoryId,
          categoryName: oldThread.categoryName,
          priority: oldThread.priority || 0,
          formResponses: oldThread.formResponses || [],
          status,
          claimedBy: oldThread.claimedBy,
          claimedAt: oldThread.claimedAt,
          markedResolvedBy: originalStatus === "resolved" ? oldThread.closedBy : undefined,
          markedResolvedAt: oldThread.resolvedAt,
          closedBy: oldThread.closedBy || "migration",
          closedAt: oldThread.closedAt || new Date(),
          closeReason: wasPreviouslyOpen ? `Migrated from old bot (was ${originalStatus})` : oldThread.closedReason || "Migrated from old bot",
          lastUserActivityAt: oldThread.lastUserActivityAt || new Date(),
          lastStaffActivityAt: oldThread.lastStaffActivityAt,
          autoCloseScheduledAt: oldThread.autoCloseScheduledAt,
          autoCloseDisabled: oldThread.autoCloseDisabled || false,
          userDisplayName: oldThread.userDisplayName || "Unknown User",
          userAvatarUrl: oldThread.userAvatar,
          createdVia: oldThread.createdVia || "dm",
          messages,
          transcripts: [],
          metrics: {
            totalMessages: messages.length,
            userMessages,
            staffMessages,
            systemMessages,
            staffOnlyMessages: 0,
            totalAttachments,
            totalResponseTime: 0,
            responseCount: 0,
          },
        });

        result.imported++;
      } catch (err: any) {
        result.errors.push(`Modmail ${oldThread.forumThreadId}: ${err.message}`);
      }
    }

    result.details = {
      categoryMappingProvided: !!categoryMapping,
      collection: usedCollection,
      note: `All threads imported from '${usedCollection}' collection with their original status preserved.`,
    };
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Modmail migration failed: ${err.message}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Full Migration Runner
// ═══════════════════════════════════════════════════════════════════════════

export async function runFullMigration(options: FullMigrationOptions): Promise<MigrationStats> {
  const { oldDbUri, guildId, categoryMapping, importOpenThreads = true, skipModmail = false, modmailCollection, onProgress } = options;

  const oldConn = await connectOldDatabase(oldDbUri);

  const steps: { key: keyof MigrationStats; label: string; run: () => Promise<MigrationResult> }[] = [
    { key: "tempVC", label: "Temp Voice Channels", run: () => migrateTempVC(oldConn, guildId) },
    { key: "activeTempChannels", label: "Active Temp Channels", run: () => migrateActiveTempChannels(oldConn, guildId) },
    { key: "tags", label: "Tags", run: () => migrateTags(oldConn, guildId) },
    { key: "suggestionConfig", label: "Suggestion Config", run: () => migrateSuggestionConfig(oldConn, guildId) },
    { key: "suggestions", label: "Suggestions", run: () => migrateSuggestions(oldConn, guildId) },
    { key: "modmailConfig", label: "Modmail Config", run: () => migrateModmailConfig(oldConn, guildId) },
    {
      key: "modmail",
      label: "Modmail Threads",
      run: () =>
        skipModmail
          ? Promise.resolve({ success: true, imported: 0, skipped: 0, errors: ["Modmail migration skipped by user"] })
          : migrateModmail(oldConn, guildId, categoryMapping, importOpenThreads, modmailCollection),
    },
  ];

  const total = steps.length;
  const stats = {} as MigrationStats;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const result = await step.run();
    stats[step.key] = result;
    onProgress?.({
      step: step.key,
      label: step.label,
      completed: i + 1,
      total,
      result,
    });
  }

  await oldConn.close();

  return stats;
}
