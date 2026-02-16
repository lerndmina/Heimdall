/**
 * Drop All Data — Wipes every Heimdall-managed collection.
 *
 * ⚠️ DESTRUCTIVE — This cannot be undone.
 *
 * Uses the same CLONE_STEPS model list as cloneMigration to ensure
 * we only drop collections Heimdall owns (not system collections).
 */

import mongoose from "mongoose";
import type { MigrationProgressEvent, MigrationResult } from "./migrationTypes.js";

// ── Model imports (same as cloneMigration) ─────────────────────────────────

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

interface DropStepDef {
  plugin: string;
  label: string;
  model: mongoose.Model<any>;
}

export interface DropResult {
  [label: string]: {
    success: boolean;
    deleted: number;
    errors: string[];
  };
}

const DROP_STEPS: DropStepDef[] = [
  // Core
  { plugin: "Core", label: "Persistent Components", model: PersistentComponent },
  { plugin: "Core", label: "Guild Environment Variables", model: GuildEnv },

  // AttachmentBlocker
  { plugin: "AttachmentBlocker", label: "Attachment Blocker Config", model: AttachmentBlockerConfig },
  { plugin: "AttachmentBlocker", label: "Attachment Blocker Channels", model: AttachmentBlockerChannel },
  { plugin: "AttachmentBlocker", label: "Attachment Blocker Openers", model: AttachmentBlockerOpener },

  // Dashboard
  { plugin: "Dashboard", label: "Dashboard Permissions", model: DashboardPermission },

  // Logging
  { plugin: "Logging", label: "Logging Config", model: LoggingConfig },

  // Minecraft
  { plugin: "Minecraft", label: "Minecraft Config", model: MinecraftConfig },
  { plugin: "Minecraft", label: "Minecraft Players", model: MinecraftPlayer },
  { plugin: "Minecraft", label: "MC Server Status", model: McServerStatus },
  { plugin: "Minecraft", label: "Role Sync Logs", model: RoleSyncLog },

  // Minigames
  { plugin: "Minigames", label: "Heimdall Coins", model: HeimdallCoin },

  // Moderation
  { plugin: "Moderation", label: "Moderation Config", model: ModerationConfig },
  { plugin: "Moderation", label: "Automod Rules", model: AutomodRule },
  { plugin: "Moderation", label: "Infractions", model: Infraction },
  { plugin: "Moderation", label: "Channel Locks", model: ChannelLock },
  { plugin: "Moderation", label: "Sticky Messages", model: StickyMessage },

  // Modmail
  { plugin: "Modmail", label: "Modmail Config", model: ModmailConfig },
  { plugin: "Modmail", label: "Modmail Threads", model: Modmail },

  // Reminders
  { plugin: "Reminders", label: "Reminders", model: Reminder },

  // RoleButtons
  { plugin: "RoleButtons", label: "Role Button Panels", model: RoleButtonPanel },

  // Suggestions
  { plugin: "Suggestions", label: "Suggestion Config", model: SuggestionConfig },
  { plugin: "Suggestions", label: "Suggestions", model: Suggestion },
  { plugin: "Suggestions", label: "Suggestion Openers", model: SuggestionOpener },

  // SupportCore
  { plugin: "SupportCore", label: "Support Bans", model: SupportBan },
  { plugin: "SupportCore", label: "Scheduled Actions", model: ScheduledAction },

  // Tags
  { plugin: "Tags", label: "Tags", model: Tag },

  // TempVC
  { plugin: "TempVC", label: "Temp VC Config", model: TempVC },
  { plugin: "TempVC", label: "Active Temp Channels", model: ActiveTempChannels },

  // Tickets
  { plugin: "Tickets", label: "Ticket Categories", model: TicketCategory },
  { plugin: "Tickets", label: "Ticket Openers", model: TicketOpener },
  { plugin: "Tickets", label: "Ticket Archive Config", model: TicketArchiveConfig },
  { plugin: "Tickets", label: "Tickets", model: Ticket },

  // VCTranscription
  { plugin: "VCTranscription", label: "Voice Transcription Config", model: VoiceTranscriptionConfig },

  // Welcome
  { plugin: "Welcome", label: "Welcome Messages", model: WelcomeMessage },
];

/**
 * Drop all documents from every Heimdall-managed collection.
 * Reports per-collection progress via onProgress callback.
 */
export async function dropAllCollections(options?: { onProgress?: (event: MigrationProgressEvent) => void }): Promise<DropResult> {
  const { onProgress } = options || {};
  const results: DropResult = {};
  const total = DROP_STEPS.length;

  for (let i = 0; i < DROP_STEPS.length; i++) {
    const step = DROP_STEPS[i]!;

    onProgress?.({
      mode: "clone",
      step: step.label,
      label: `Dropping ${step.label}`,
      plugin: step.plugin,
      completed: i,
      total,
    });

    try {
      const deleteResult = await step.model.deleteMany({});
      results[step.label] = {
        success: true,
        deleted: deleteResult.deletedCount,
        errors: [],
      };
    } catch (err: any) {
      results[step.label] = {
        success: false,
        deleted: 0,
        errors: [err.message],
      };
    }

    onProgress?.({
      mode: "clone",
      step: step.label,
      label: `Dropping ${step.label}`,
      plugin: step.plugin,
      completed: i + 1,
      total,
      result: results[step.label] as any,
    });
  }

  return results;
}
