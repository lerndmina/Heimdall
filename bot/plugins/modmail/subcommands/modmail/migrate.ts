/**
 * /modmail migrate - Import modmail data from old Heimdall database
 *
 * Connects to the old Heimdall MongoDB, reads ModmailConfig, Modmail tickets,
 * and ModmailBan documents, then maps them into the new schema and inserts them.
 *
 * Usage: /modmail migrate database:<old-db-name> [collection:<old-modmail-collection>]
 *
 * The command reuses the current MONGODB_URI connection string but targets the
 * specified database name, so the old data must live on the same MongoDB cluster.
 */

import { PermissionFlagsBits, type GuildMember } from "discord.js";
import mongoose, { Schema } from "mongoose";
import { nanoid } from "nanoid";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import ModmailConfig from "../../models/ModmailConfig.js";
import Modmail, { ModmailStatus, MessageType, MessageContext } from "../../models/Modmail.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:migrate");

// ─── Old-system schema definitions (read-only, used with createConnection) ──

const OldFormResponseSchema = new Schema({ fieldId: String, fieldLabel: String, fieldType: String, value: String }, { _id: false, strict: false });

const OldMessageSchema = new Schema(
  {
    messageId: String,
    type: { type: String, enum: ["user", "staff"] },
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
    attachments: [{ filename: String, url: String, size: Number, contentType: String }],
    isEdited: { type: Boolean, default: false },
    editedContent: String,
    editedAt: Date,
    editedBy: String,
    createdAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: String,
  },
  { _id: false, strict: false },
);

const OldModmailSchema = new Schema(
  {
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
    formResponses: [OldFormResponseSchema],
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
    messages: [OldMessageSchema],
  },
  { strict: false },
);

const OldConfigSchema = new Schema(
  {
    guildId: String,
    guildDescription: String,
    masterStaffRoleId: String,
    defaultCategory: { type: Schema.Types.Mixed },
    categories: [Schema.Types.Mixed],
    forumChannelId: String,
    staffRoleId: String,
    webhookId: String,
    webhookToken: String,
    tags: [{ snowflake: String, status: String }],
    inactivityWarningHours: Number,
    autoCloseHours: Number,
    enableAutoClose: Boolean,
    enableInactivityWarning: Boolean,
    nextTicketNumber: Number,
    typingIndicators: Boolean,
    typingIndicatorStyle: String,
    globalAIConfig: Schema.Types.Mixed,
    minimumMessageLength: Number,
  },
  { strict: false, timestamps: true },
);

const OldBanSchema = new Schema(
  {
    guildId: String,
    userId: String,
    bannedBy: String,
    reason: String,
    duration: Number,
    permanent: Boolean,
    bannedAt: Date,
    expiresAt: Date,
    unbanned: Boolean,
    unbannedAt: Date,
    unbannedBy: String,
    unbannedReason: String,
    previousBans: [Schema.Types.Mixed],
  },
  { strict: false },
);

// ─── Migration handler ──────────────────────────────────────────────────────

export async function handleMigrate(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  // Permission check
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "Only administrators can run the migration command.")],
    });
    return;
  }

  const databaseName = interaction.options.getString("database", true);
  const collectionName = interaction.options.getString("collection") || "modmails";
  const guildId = interaction.guildId!;

  // Get the URI from the environment
  const envUri = process.env.MONGODB_URI;
  if (!envUri) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Configuration Error", "Could not determine MongoDB connection URI.")],
    });
    return;
  }

  let oldConn: mongoose.Connection | null = null;

  try {
    // Connect to the old database
    await interaction.editReply({
      embeds: [ModmailEmbeds.info("Migration Started", `Connecting to database \`${databaseName}\` (collection: \`${collectionName}\`)…`)],
    });

    oldConn = mongoose.createConnection(envUri, { dbName: databaseName });
    await oldConn.asPromise();

    // Register models on the old connection
    const OldModmail = oldConn.model("OldModmail", OldModmailSchema, collectionName);
    const OldConfig = oldConn.model("OldConfig", OldConfigSchema, "modmailconfigs");
    const OldBan = oldConn.model("OldBan", OldBanSchema, "modmailbans");

    // ── 1. Import Config ──────────────────────────────────────────────

    const oldConfig = await OldConfig.findOne({ guildId }).lean();
    let configImported = false;
    let categoriesMigrated = 0;

    if (oldConfig) {
      const existingConfig = await ModmailConfig.findOne({ guildId });

      if (existingConfig) {
        await interaction.editReply({
          embeds: [ModmailEmbeds.warning("Config Exists", "A modmail config already exists for this guild — skipping config import.\nTickets and bans will still be imported.")],
        });
      } else {
        // Map old categories to new format
        const newCategories: any[] = [];
        const globalStaffRoleIds: string[] = [];

        // Legacy staff role → global staff roles
        if (oldConfig.masterStaffRoleId) globalStaffRoleIds.push(oldConfig.masterStaffRoleId as string);
        else if (oldConfig.staffRoleId) globalStaffRoleIds.push(oldConfig.staffRoleId as string);

        // Map default category
        const defaultCat = oldConfig.defaultCategory as any;
        if (defaultCat) {
          const catId = defaultCat.id || nanoid(12);
          newCategories.push({
            id: catId,
            name: defaultCat.name || "General Support",
            description: defaultCat.description || "",
            emoji: defaultCat.emoji || "",
            forumChannelId: oldConfig.forumChannelId,
            webhookId: oldConfig.webhookId || "",
            encryptedWebhookToken: oldConfig.webhookToken ? ModmailConfig.encryptWebhookToken(oldConfig.webhookToken as string, pluginAPI.encryptionKey) : "",
            staffRoleIds: [],
            priority: defaultCat.priority || 2,
            formFields: mapFormFields(defaultCat.formFields || []),
            resolveAutoCloseHours: 24,
            enabled: defaultCat.isActive !== false,
          });
        }

        // Map additional categories
        if (Array.isArray(oldConfig.categories)) {
          for (const cat of oldConfig.categories as any[]) {
            const catId = cat.id || nanoid(12);
            newCategories.push({
              id: catId,
              name: cat.name || "Unnamed",
              description: cat.description || "",
              emoji: cat.emoji || "",
              forumChannelId: cat.forumChannelId || oldConfig.forumChannelId,
              webhookId: oldConfig.webhookId || "",
              encryptedWebhookToken: oldConfig.webhookToken ? ModmailConfig.encryptWebhookToken(oldConfig.webhookToken as string, pluginAPI.encryptionKey) : "",
              staffRoleIds: cat.staffRoleId ? [cat.staffRoleId] : [],
              priority: cat.priority || 2,
              formFields: mapFormFields(cat.formFields || []),
              resolveAutoCloseHours: 24,
              enabled: cat.isActive !== false,
            });
          }
        }

        // If no categories at all, create a default one
        if (newCategories.length === 0) {
          newCategories.push({
            id: nanoid(12),
            name: "General Support",
            description: "Imported default category",
            forumChannelId: oldConfig.forumChannelId || "",
            webhookId: oldConfig.webhookId || "",
            encryptedWebhookToken: oldConfig.webhookToken ? ModmailConfig.encryptWebhookToken(oldConfig.webhookToken as string, pluginAPI.encryptionKey) : "",
            staffRoleIds: [],
            priority: 2,
            formFields: [],
            resolveAutoCloseHours: 24,
            enabled: true,
          });
        }

        categoriesMigrated = newCategories.length;

        // Map forum tags
        const forumTags: Record<string, string> = {};
        if (Array.isArray(oldConfig.tags)) {
          for (const tag of oldConfig.tags as any[]) {
            if (tag.status === "open") forumTags.openTagId = tag.snowflake;
            if (tag.status === "closed") forumTags.closedTagId = tag.snowflake;
          }
        }

        await ModmailConfig.create({
          guildId,
          enabled: true,
          globalStaffRoleIds,
          defaultCategoryId: newCategories[0]?.id,
          categories: newCategories,
          threadNamingPattern: "#{number} | {username} | {claimer}",
          nextTicketNumber: (oldConfig.nextTicketNumber as number) || 1,
          minimumMessageLength: (oldConfig.minimumMessageLength as number) || 10,
          rateLimitSeconds: 5,
          enableAutoClose: oldConfig.enableAutoClose !== false,
          enableInactivityWarning: oldConfig.enableInactivityWarning !== false,
          autoCloseHours: (oldConfig.autoCloseHours as number) || 72,
          autoCloseWarningHours: (oldConfig.inactivityWarningHours as number) || 12,
          typingIndicators: oldConfig.typingIndicators !== false,
          typingIndicatorStyle: (oldConfig.typingIndicatorStyle as string) || "native",
          forumTags,
        });

        configImported = true;
        log.info(`Migrated config for guild ${guildId} with ${categoriesMigrated} categories`);
      }
    }

    // ── 2. Import Tickets ─────────────────────────────────────────────

    const oldTickets = await OldModmail.find({ guildId }).lean();
    let ticketsImported = 0;
    let ticketsSkipped = 0;

    for (const ticket of oldTickets) {
      // Skip if ticket already exists (by forumThreadId)
      const existing = await Modmail.findOne({ forumThreadId: ticket.forumThreadId });
      if (existing) {
        ticketsSkipped++;
        continue;
      }

      // Map status
      let status = ModmailStatus.OPEN;
      if (ticket.isClosed) status = ModmailStatus.CLOSED;
      else if (ticket.markedResolved) status = ModmailStatus.RESOLVED;

      // Map messages
      const newMessages = (ticket.messages || []).map((msg: any) => ({
        messageId: msg.messageId || nanoid(14),
        discordMessageId: msg.discordMessageId || msg.webhookMessageId,
        discordDmMessageId: msg.dmMessageId,
        authorId: msg.authorId,
        authorType: msg.type === "staff" ? MessageType.STAFF : MessageType.USER,
        context: MessageContext.BOTH,
        content: msg.content,
        isStaffOnly: false,
        attachments: (msg.attachments || []).map((att: any) => ({
          filename: att.filename,
          url: att.url,
          size: att.size,
          contentType: att.contentType,
          spoiler: false,
        })),
        timestamp: msg.createdAt || new Date(),
        isEdited: msg.isEdited || false,
        editedAt: msg.editedAt,
        originalContent: msg.editedContent,
        isDeleted: msg.isDeleted || false,
        deletedAt: msg.deletedAt,
        deletedBy: msg.deletedBy,
        deliveredToDm: true,
        deliveredToThread: true,
      }));

      // Map form responses
      const formResponses = (ticket.formResponses || []).map((fr: any) => ({
        fieldId: fr.fieldId,
        fieldLabel: fr.fieldLabel,
        fieldType: fr.fieldType || "short",
        value: fr.value,
      }));

      // Count messages for metrics
      const userMsgCount = newMessages.filter((m: any) => m.authorType === MessageType.USER).length;
      const staffMsgCount = newMessages.filter((m: any) => m.authorType === MessageType.STAFF).length;
      const totalAttachments = newMessages.reduce((sum: number, m: any) => sum + (m.attachments?.length || 0), 0);

      try {
        await Modmail.create({
          modmailId: nanoid(16),
          ticketNumber: ticket.ticketNumber || 0,
          guildId: ticket.guildId,
          userId: ticket.userId,
          forumChannelId: ticket.forumChannelId,
          forumThreadId: ticket.forumThreadId,
          categoryId: ticket.categoryId,
          categoryName: ticket.categoryName,
          priority: ticket.priority || 2,
          formResponses,
          status,
          claimedBy: ticket.claimedBy,
          claimedAt: ticket.claimedAt,
          markedResolvedAt: ticket.resolvedAt,
          closedBy: ticket.closedBy,
          closedAt: ticket.closedAt,
          closeReason: ticket.closedReason,
          lastUserActivityAt: ticket.lastUserActivityAt || new Date(),
          lastStaffActivityAt: ticket.lastStaffActivityAt,
          autoCloseScheduledAt: ticket.autoCloseScheduledAt,
          autoCloseDisabled: ticket.autoCloseDisabled || false,
          userDisplayName: ticket.userDisplayName || "Unknown",
          userAvatarUrl: ticket.userAvatar,
          createdVia: ticket.createdVia || "dm",
          messages: newMessages,
          metrics: {
            totalMessages: newMessages.length,
            userMessages: userMsgCount,
            staffMessages: staffMsgCount,
            systemMessages: 0,
            staffOnlyMessages: 0,
            totalAttachments,
            totalResponseTime: 0,
            responseCount: 0,
          },
        });

        ticketsImported++;
      } catch (err) {
        log.warn(`Failed to import ticket ${ticket.forumThreadId}:`, err);
        ticketsSkipped++;
      }
    }

    // ── 3. Import Bans ────────────────────────────────────────────────

    const SupportBan = pluginAPI.supportCore.SupportBan;
    const { SupportBanType, SupportBanSystem } = pluginAPI.supportCore;

    const oldBans = await OldBan.find({ guildId }).lean();
    let bansImported = 0;
    let bansSkipped = 0;

    for (const ban of oldBans) {
      // Skip unbanned entries
      if (ban.unbanned) {
        bansSkipped++;
        continue;
      }

      // Check if ban already exists
      const existing = await SupportBan.findOne({
        guildId,
        userId: ban.userId,
        active: true,
        $or: [{ systemType: SupportBanSystem.MODMAIL }, { systemType: SupportBanSystem.BOTH }],
      });

      if (existing) {
        bansSkipped++;
        continue;
      }

      try {
        await SupportBan.create({
          guildId,
          userId: ban.userId,
          systemType: SupportBanSystem.MODMAIL,
          banType: ban.permanent ? SupportBanType.PERMANENT : SupportBanType.TEMPORARY,
          reason: ban.reason || "Imported from old system",
          bannedBy: ban.bannedBy,
          bannedAt: ban.bannedAt || new Date(),
          expiresAt: ban.expiresAt || null,
          active: true,
        });
        bansImported++;
      } catch (err) {
        log.warn(`Failed to import ban for user ${ban.userId}:`, err);
        bansSkipped++;
      }
    }

    // ── 4. Report ────────────────────────────────────────────────────

    const fields = [
      {
        name: "📋 Config",
        value: configImported ? `✅ Imported (${categoriesMigrated} categories)` : oldConfig ? "⏭️ Skipped (already exists)" : "⚠️ No config found in old database",
        inline: true,
      },
      {
        name: "📨 Tickets",
        value: `✅ ${ticketsImported} imported\n⏭️ ${ticketsSkipped} skipped`,
        inline: true,
      },
      {
        name: "🚫 Bans",
        value: `✅ ${bansImported} imported\n⏭️ ${bansSkipped} skipped`,
        inline: true,
      },
    ];

    await interaction.editReply({
      embeds: [ModmailEmbeds.success("Migration Complete", `Imported data from \`${databaseName}\` (collection: \`${collectionName}\`).`, fields)],
    });

    log.info(`Migration complete for guild ${guildId}: config=${configImported}, tickets=${ticketsImported}, bans=${bansImported}`);
  } catch (error) {
    log.error("Migration failed:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Migration Failed", `An error occurred during migration:\n\`\`\`${error instanceof Error ? error.message : String(error)}\`\`\``)],
    });
  } finally {
    // Always close the old connection
    if (oldConn) {
      try {
        await oldConn.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map old form fields (options: string[]) to new format (options: {label, value}[]).
 */
function mapFormFields(fields: any[]): any[] {
  return fields.map((f) => ({
    id: f.id || nanoid(8),
    label: f.label || "Field",
    type: f.type || "short",
    required: f.required || false,
    placeholder: f.placeholder,
    minLength: f.minLength,
    maxLength: f.maxLength,
    options: Array.isArray(f.options) ? f.options.map((opt: any) => (typeof opt === "string" ? { label: opt, value: opt.toLowerCase().replace(/\s+/g, "_") } : opt)) : [],
  }));
}
