/**
 * Instance Clone Migration Engine
 *
 * Copies all collections from a source Heimdall database to the local database.
 * Both databases must have identical schemas (Heimdall → Heimdall migration).
 *
 * Features:
 * - Groups collections by plugin with logical ordering
 * - Per-record progress via onProgress callback
 * - Idempotent: skips existing documents by _id / unique key
 * - Handles Infraction.ruleId ObjectId remapping for AutomodRule
 * - Encrypted fields copied as-is (both instances must share ENCRYPTION_KEY)
 * - Skips TTL-indexed ephemeral models (TicTacToe, Connect4)
 * - Optional guildId filter
 */

import mongoose from "mongoose";
import { connectOldDatabase } from "./migration.js";
import type { MigrationProgressEvent, MigrationResult } from "./migrationTypes.js";

// ── Model imports (grouped by plugin) ──────────────────────────────────────

import PersistentComponent from "../../../src/core/models/PersistentComponent.js";
import GuildEnv from "../../../src/core/models/GuildEnv.js";
import AttachmentBlockerConfig from "../../attachment-blocker/models/AttachmentBlockerConfig.js";
import AttachmentBlockerChannel from "../../attachment-blocker/models/AttachmentBlockerChannel.js";
import AttachmentBlockerOpener from "../../attachment-blocker/models/AttachmentBlockerOpener.js";
import DashboardPermission from "../../dashboard/models/DashboardPermission.js";
import LoggingConfig from "../../logging/models/LoggingConfig.js";
import MinecraftConfig from "../../minecraft/models/MinecraftConfig.js";
import MinecraftPlayer from "../../minecraft/models/MinecraftPlayer.js";
import McServerStatus from "../../minecraft/models/McServerStatus.js";
import RoleSyncLog from "../../minecraft/models/RoleSyncLog.js";
import HeimdallCoin from "../../minigames/models/HeimdallCoin.js";
import ModerationConfig from "../../moderation/models/ModerationConfig.js";
import AutomodRule from "../../moderation/models/AutomodRule.js";
import Infraction from "../../moderation/models/Infraction.js";
import ChannelLock from "../../moderation/models/ChannelLock.js";
import StickyMessage from "../../moderation/models/StickyMessage.js";
import ModmailConfig from "../../modmail/models/ModmailConfig.js";
import Modmail from "../../modmail/models/Modmail.js";
import Reminder from "../../reminders/models/Reminder.js";
import RoleButtonPanel from "../../rolebuttons/models/RoleButtonPanel.js";
import SuggestionConfig from "../../suggestions/models/SuggestionConfig.js";
import Suggestion from "../../suggestions/models/Suggestion.js";
import SuggestionOpener from "../../suggestions/models/SuggestionOpener.js";
import SupportBan from "../../support-core/models/SupportBan.js";
import ScheduledAction from "../../support-core/models/ScheduledAction.js";
import Tag from "../../tags/models/Tag.js";
import TempVC from "../../tempvc/models/TempVC.js";
import ActiveTempChannels from "../../tempvc/models/ActiveTempChannels.js";
import TicketCategory from "../../tickets/models/TicketCategory.js";
import TicketOpener from "../../tickets/models/TicketOpener.js";
import TicketArchiveConfig from "../../tickets/models/TicketArchiveConfig.js";
import Ticket from "../../tickets/models/Ticket.js";
import VoiceTranscriptionConfig from "../../vc-transcription/models/VoiceTranscriptionConfig.js";
import WelcomeMessage from "../../welcome/models/WelcomeMessage.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface CloneModelDef {
  plugin: string;
  label: string;
  model: mongoose.Model<any>;
  /** Whether the model has a guildId field for filtering */
  hasGuildId: boolean;
  /** Custom document transformer (e.g., ruleId remapping) */
  transformDoc?: (doc: any, context: CloneContext) => any;
}

interface CloneContext {
  /** Maps source AutomodRule._id → target AutomodRule._id */
  automodRuleIdMap: Map<string, string>;
}

export interface CloneMigrationOptions {
  sourceDbUri: string;
  guildId?: string;
  onProgress?: (event: MigrationProgressEvent) => void;
}

export interface CloneMigrationStats {
  [modelLabel: string]: MigrationResult;
}

// ── Step definitions ────────────────────────────────────────────────────────
// Ordered so config models come before data models within each plugin.
// AutomodRule comes before Infraction for ruleId remapping.
// Skips: TicTacToe, Connect4 (24h TTL ephemeral game state).

const CLONE_STEPS: CloneModelDef[] = [
  // Core
  { plugin: "Core", label: "Persistent Components", model: PersistentComponent, hasGuildId: false },
  { plugin: "Core", label: "Guild Environment Variables", model: GuildEnv, hasGuildId: true },

  // AttachmentBlocker
  { plugin: "AttachmentBlocker", label: "Attachment Blocker Config", model: AttachmentBlockerConfig, hasGuildId: true },
  { plugin: "AttachmentBlocker", label: "Attachment Blocker Channels", model: AttachmentBlockerChannel, hasGuildId: true },
  { plugin: "AttachmentBlocker", label: "Attachment Blocker Openers", model: AttachmentBlockerOpener, hasGuildId: true },

  // Dashboard
  { plugin: "Dashboard", label: "Dashboard Permissions", model: DashboardPermission, hasGuildId: true },

  // Logging
  { plugin: "Logging", label: "Logging Config", model: LoggingConfig, hasGuildId: true },

  // Minecraft
  { plugin: "Minecraft", label: "Minecraft Config", model: MinecraftConfig, hasGuildId: true },
  { plugin: "Minecraft", label: "Minecraft Players", model: MinecraftPlayer, hasGuildId: true },
  { plugin: "Minecraft", label: "MC Server Status", model: McServerStatus, hasGuildId: true },
  { plugin: "Minecraft", label: "Role Sync Logs", model: RoleSyncLog, hasGuildId: true },

  // Minigames (TicTacToe + Connect4 skipped — 24h TTL ephemeral)
  { plugin: "Minigames", label: "Heimdall Coins", model: HeimdallCoin, hasGuildId: false },

  // Moderation — AutomodRule MUST come before Infraction for ruleId remapping
  { plugin: "Moderation", label: "Moderation Config", model: ModerationConfig, hasGuildId: true },
  { plugin: "Moderation", label: "Automod Rules", model: AutomodRule, hasGuildId: true },
  {
    plugin: "Moderation",
    label: "Infractions",
    model: Infraction,
    hasGuildId: true,
    transformDoc: (doc, ctx) => {
      if (doc.ruleId) {
        const mapped = ctx.automodRuleIdMap.get(doc.ruleId.toString());
        if (mapped) {
          doc.ruleId = new mongoose.Types.ObjectId(mapped);
        }
      }
      return doc;
    },
  },
  { plugin: "Moderation", label: "Channel Locks", model: ChannelLock, hasGuildId: true },
  { plugin: "Moderation", label: "Sticky Messages", model: StickyMessage, hasGuildId: true },

  // Modmail
  { plugin: "Modmail", label: "Modmail Config", model: ModmailConfig, hasGuildId: true },
  { plugin: "Modmail", label: "Modmail Threads", model: Modmail, hasGuildId: true },

  // Reminders
  { plugin: "Reminders", label: "Reminders", model: Reminder, hasGuildId: true },

  // RoleButtons
  { plugin: "RoleButtons", label: "Role Button Panels", model: RoleButtonPanel, hasGuildId: true },

  // Suggestions
  { plugin: "Suggestions", label: "Suggestion Config", model: SuggestionConfig, hasGuildId: true },
  { plugin: "Suggestions", label: "Suggestions", model: Suggestion, hasGuildId: true },
  { plugin: "Suggestions", label: "Suggestion Openers", model: SuggestionOpener, hasGuildId: true },

  // SupportCore
  { plugin: "SupportCore", label: "Support Bans", model: SupportBan, hasGuildId: true },
  { plugin: "SupportCore", label: "Scheduled Actions", model: ScheduledAction, hasGuildId: true },

  // Tags
  { plugin: "Tags", label: "Tags", model: Tag, hasGuildId: true },

  // TempVC
  { plugin: "TempVC", label: "Temp VC Config", model: TempVC, hasGuildId: true },
  { plugin: "TempVC", label: "Active Temp Channels", model: ActiveTempChannels, hasGuildId: true },

  // Tickets
  { plugin: "Tickets", label: "Ticket Categories", model: TicketCategory, hasGuildId: true },
  { plugin: "Tickets", label: "Ticket Openers", model: TicketOpener, hasGuildId: true },
  { plugin: "Tickets", label: "Ticket Archive Config", model: TicketArchiveConfig, hasGuildId: true },
  { plugin: "Tickets", label: "Tickets", model: Ticket, hasGuildId: true },

  // VCTranscription
  { plugin: "VCTranscription", label: "Voice Transcription Config", model: VoiceTranscriptionConfig, hasGuildId: true },

  // Welcome
  { plugin: "Welcome", label: "Welcome Messages", model: WelcomeMessage, hasGuildId: true },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

/**
 * Insert a batch of documents into the target collection.
 * Uses raw MongoDB driver to bypass Mongoose validation (raw clone).
 * Handles duplicate key errors gracefully for idempotent re-runs.
 */
async function insertBatch(model: mongoose.Model<any>, docs: any[], result: MigrationResult): Promise<void> {
  if (docs.length === 0) return;

  try {
    const res = await model.collection.insertMany(docs, { ordered: false });
    result.imported += res.insertedCount;
  } catch (err: any) {
    if (err.code === 11000 || err.writeErrors) {
      // BulkWriteError: some inserts succeeded, rest had duplicate keys
      const insertedCount = err.result?.insertedCount ?? err.insertedCount ?? 0;
      result.imported += insertedCount;
      result.skipped += docs.length - insertedCount;
    } else {
      result.errors.push(err.message);
      result.success = false;
    }
  }
}

/**
 * Clone a single collection from source to target.
 * Reads from source in batches, inserts into target, reports per-record progress.
 */
async function cloneCollection(
  sourceConn: mongoose.Connection,
  step: CloneModelDef,
  guildId: string | undefined,
  context: CloneContext,
  onRecordProgress?: (index: number, total: number) => void,
): Promise<MigrationResult> {
  const result: MigrationResult = { success: true, imported: 0, skipped: 0, errors: [] };

  try {
    const collectionName = step.model.collection.name;
    const sourceCollection = sourceConn.db!.collection(collectionName);

    // Build query filter
    const filter: Record<string, any> = {};
    if (guildId && step.hasGuildId) {
      filter.guildId = guildId;
    } else if (guildId && !step.hasGuildId) {
      // Global model — skip when guild filter is active
      result.details = { message: "Skipped (global model, guild filter active)" };
      return result;
    }

    const total = await sourceCollection.countDocuments(filter);
    if (total === 0) return result;

    onRecordProgress?.(0, total);

    let processed = 0;
    let batch: any[] = [];
    const cursor = sourceCollection.find(filter).batchSize(BATCH_SIZE);

    for await (const doc of cursor) {
      let processedDoc = { ...doc };
      if (step.transformDoc) {
        processedDoc = step.transformDoc(processedDoc, context);
      }
      batch.push(processedDoc);

      if (batch.length >= BATCH_SIZE) {
        await insertBatch(step.model, batch, result);
        processed += batch.length;
        batch = [];
        onRecordProgress?.(processed, total);
      }
    }

    // Final partial batch
    if (batch.length > 0) {
      await insertBatch(step.model, batch, result);
      processed += batch.length;
      onRecordProgress?.(processed, total);
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(`${step.label}: ${err.message}`);
  }

  return result;
}

/**
 * Build a map of source AutomodRule._id → target AutomodRule._id.
 * Used to remap Infraction.ruleId references after cloning AutomodRules.
 *
 * For freshly inserted rules, source._id === target._id (preserved).
 * For skipped rules (already existed), source._id may differ from target._id.
 */
async function buildAutomodRuleIdMap(sourceConn: mongoose.Connection, guildId?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const sourceCollection = sourceConn.db!.collection(AutomodRule.collection.name);
  const filter: Record<string, any> = guildId ? { guildId } : {};
  const sourceDocs = await sourceCollection.find(filter).toArray();

  for (const sourceDoc of sourceDocs) {
    // Find target doc by compound unique key {guildId, name}
    const targetDoc = await AutomodRule.findOne({
      guildId: sourceDoc.guildId,
      name: sourceDoc.name,
    }).lean();

    if (targetDoc) {
      map.set(sourceDoc._id.toString(), (targetDoc._id as mongoose.Types.ObjectId).toString());
    }
  }

  return map;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export async function runCloneMigration(options: CloneMigrationOptions): Promise<CloneMigrationStats> {
  const { sourceDbUri, guildId, onProgress } = options;

  const sourceConn = await connectOldDatabase(sourceDbUri);
  const stats: CloneMigrationStats = {};
  const context: CloneContext = { automodRuleIdMap: new Map() };
  const total = CLONE_STEPS.length;

  try {
    for (let i = 0; i < CLONE_STEPS.length; i++) {
      const step = CLONE_STEPS[i]!;

      // Emit step_start
      onProgress?.({
        mode: "clone",
        step: step.label,
        label: step.label,
        plugin: step.plugin,
        completed: i,
        total,
      });

      const result = await cloneCollection(sourceConn, step, guildId, context, (recordIndex, recordTotal) => {
        onProgress?.({
          mode: "clone",
          step: step.label,
          label: step.label,
          plugin: step.plugin,
          completed: i,
          total,
          recordIndex,
          recordTotal,
        });
      });

      stats[step.label] = result;

      // After cloning AutomodRule, build the ruleId map for Infraction remapping
      if (step.model === AutomodRule) {
        context.automodRuleIdMap = await buildAutomodRuleIdMap(sourceConn, guildId);
      }

      // Emit step_complete
      onProgress?.({
        mode: "clone",
        step: step.label,
        label: step.label,
        plugin: step.plugin,
        completed: i + 1,
        total,
        result,
      });
    }
  } finally {
    await sourceConn.close();
  }

  return stats;
}
