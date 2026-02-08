/**
 * Shared whitelist import mapping for dashboard/API and Discord command.
 */

export interface OldPlayerDoc {
  // MinecraftPlayer fields
  guildId?: string;
  minecraftUuid?: string;
  minecraftUsername?: string;
  discordId?: string;
  discordUsername?: string;
  discordDisplayName?: string;
  linkedAt?: string | { $date: string };
  whitelistedAt?: string | { $date: string };
  lastConnectionAttempt?: string | { $date: string };
  authCode?: string;
  expiresAt?: string | { $date: string };
  codeShownAt?: string | { $date: string };
  confirmedAt?: string | { $date: string };
  isExistingPlayerLink?: boolean;
  rejectionReason?: string;
  approvedBy?: string;
  revokedBy?: string;
  revokedAt?: string | { $date: string };
  revocationReason?: string;
  source?: string;
  notes?: string;
  lastDiscordRoles?: string[];
  lastMinecraftGroups?: string[];
  lastRoleSyncAt?: string | { $date: string };
  roleSyncEnabled?: boolean;
  createdAt?: string | { $date: string };
  updatedAt?: string | { $date: string };

  // MinecraftAuthPending fields (legacy separate collection)
  status?: string;
  rejectedBy?: string;
  lastConnectionAttempt_legacy?: {
    timestamp?: string | { $date: string };
    ip?: string;
    uuid?: string;
  };
}

/** Parse a date that might be a string, a {$date: string} (mongoexport extended JSON), or null */
export function parseDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof val === "object" && val !== null && "$date" in val) {
    const d = new Date((val as { $date: string }).$date);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Determine the source to assign to an imported record.
 * Old data may have source = "imported" | "linked" | "manual".
 * We map everything coming in to "imported" unless it was "manual".
 */
function mapSource(old: OldPlayerDoc): "imported" | "linked" | "manual" | "existing" {
  if (old.source === "manual") return "manual";
  if (old.source === "linked") return "linked";
  if (old.source === "existing") return "existing" as any;
  return "imported";
}

/**
 * Convert an old MinecraftPlayer or MinecraftAuthPending document
 * into the shape expected by the current MinecraftPlayer schema.
 */
export function mapOldToNew(doc: OldPlayerDoc, guildId: string) {
  // If this is an AuthPending doc (has `status` field with auth-specific values),
  // convert it into a player record
  const isAuthPending = doc.status && ["awaiting_connection", "code_shown", "code_confirmed", "expired", "rejected"].includes(doc.status);

  const mapped: Record<string, unknown> = {
    guildId,
    minecraftUsername: doc.minecraftUsername,
    source: isAuthPending ? "linked" : mapSource(doc),
  };

  // MC identity
  if (doc.minecraftUuid) mapped.minecraftUuid = doc.minecraftUuid;

  // Discord identity
  if (doc.discordId) mapped.discordId = doc.discordId;
  if (doc.discordUsername) mapped.discordUsername = doc.discordUsername;
  if (doc.discordDisplayName) mapped.discordDisplayName = doc.discordDisplayName;

  // Timestamps
  const linkedAt = parseDate(doc.linkedAt);
  const whitelistedAt = parseDate(doc.whitelistedAt);
  const confirmedAt = parseDate(doc.confirmedAt);
  const revokedAt = parseDate(doc.revokedAt);
  const createdAt = parseDate(doc.createdAt);
  const lastConnectionAttempt = parseDate(doc.lastConnectionAttempt);

  if (linkedAt) mapped.linkedAt = linkedAt;
  if (whitelistedAt) mapped.whitelistedAt = whitelistedAt;
  if (confirmedAt) mapped.confirmedAt = confirmedAt;
  if (lastConnectionAttempt) mapped.lastConnectionAttempt = lastConnectionAttempt;

  // For AuthPending docs: if status was "code_confirmed", treat as whitelisted+linked
  if (isAuthPending) {
    if (!linkedAt && doc.discordId) mapped.linkedAt = confirmedAt || createdAt || new Date();
    if (doc.status === "code_confirmed" && !whitelistedAt) {
      mapped.whitelistedAt = confirmedAt || new Date();
    }
  }

  // Revocation
  if (revokedAt) {
    mapped.revokedAt = revokedAt;
    if (doc.revokedBy) mapped.revokedBy = doc.revokedBy;
    if (doc.revocationReason) mapped.revocationReason = doc.revocationReason;
  }

  // Rejection (from AuthPending)
  if (doc.rejectionReason) mapped.rejectionReason = doc.rejectionReason;
  if (doc.status === "rejected" && doc.rejectedBy) {
    // Store rejectedBy in notes since the new model doesn't have that field
    mapped.notes = `Rejected by <@${doc.rejectedBy}>${doc.rejectionReason ? `: ${doc.rejectionReason}` : ""}`;
    mapped.rejectionReason = doc.rejectionReason;
  }

  // Audit
  if (doc.approvedBy) mapped.approvedBy = doc.approvedBy;
  if (doc.isExistingPlayerLink) mapped.isExistingPlayerLink = doc.isExistingPlayerLink;

  // Metadata
  if (doc.notes && !mapped.notes) mapped.notes = doc.notes;

  // Role sync
  if (doc.lastDiscordRoles?.length) mapped.lastDiscordRoles = doc.lastDiscordRoles;
  if (doc.lastMinecraftGroups?.length) mapped.lastMinecraftGroups = doc.lastMinecraftGroups;
  const lastRoleSyncAt = parseDate(doc.lastRoleSyncAt);
  if (lastRoleSyncAt) mapped.lastRoleSyncAt = lastRoleSyncAt;
  if (doc.roleSyncEnabled !== undefined) mapped.roleSyncEnabled = doc.roleSyncEnabled;

  // Ensure linkedAt is set for any player that has a discordId (they were linked at some point)
  if (doc.discordId && !mapped.linkedAt) {
    mapped.linkedAt = linkedAt || whitelistedAt || confirmedAt || createdAt || new Date();
  }

  return mapped;
}
