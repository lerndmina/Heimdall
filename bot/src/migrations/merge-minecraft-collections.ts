import MinecraftPlayer from "../models/MinecraftPlayer.js";
import MinecraftAuthPending from "../models/MinecraftAuthPending.js";
import log from "../utils/log.js";

interface LegacyMinecraftPlayer {
  _id: string;
  guildId: string;
  minecraftUuid: string;
  minecraftUsername: string;
  discordId?: string;
  whitelistStatus: "whitelisted" | "unwhitelisted";
  whitelistedAt?: Date;
  linkedAt?: Date;
  approvedBy?: string;
  source: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectionAttempt?: Date;
}

interface MinecraftAuthPendingDoc {
  _id: string;
  guildId: string;
  minecraftUuid?: string;
  minecraftUsername?: string;
  discordId?: string;
  authCode: string;
  expiresAt: Date;
  codeShownAt?: Date;
  confirmedAt?: Date;
  isExistingPlayerLink: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function mergeMinecraftCollections() {
  try {
    log.info("🔄 Starting Minecraft collections merge...");

    // Step 1: Get current data
    const players = (await MinecraftPlayer.find({}).lean()) as LegacyMinecraftPlayer[];
    const pending = (await MinecraftAuthPending.find({}).lean()) as MinecraftAuthPendingDoc[];

    log.info(`📊 Found ${players.length} existing players, ${pending.length} pending auth records`);

    // Step 2: Update existing players - remove whitelistStatus, add new fields
    log.info("🔧 Updating existing players...");
    let playersUpdated = 0;

    for (const player of players) {
      try {
        await MinecraftPlayer.updateOne(
          { _id: player._id },
          {
            $unset: { whitelistStatus: 1 }, // Remove redundant field
            $set: {
              // Initialize new auth fields as null
              authCode: null,
              expiresAt: null,
              codeShownAt: null,
              confirmedAt: null,
              isExistingPlayerLink: null,
              rejectionReason: null,
              updatedAt: new Date(),
            },
          }
        );
        playersUpdated++;

        if (playersUpdated % 50 === 0) {
          log.info(`   ✅ Updated ${playersUpdated}/${players.length} players...`);
        }
      } catch (error) {
        log.error(`❌ Failed to update player ${player.minecraftUsername}:`, error);
      }
    }

    log.info(`✅ Updated ${playersUpdated} existing players`);

    // Step 3: Migrate auth pending records
    log.info("🔄 Migrating pending auth records...");
    let authRecordsMigrated = 0;
    let newPlayersCreated = 0;
    let existingPlayersLinked = 0;

    for (const auth of pending) {
      try {
        if (auth.isExistingPlayerLink && auth.minecraftUuid) {
          // Update existing player with auth data
          const result = await MinecraftPlayer.updateOne(
            { minecraftUuid: auth.minecraftUuid, guildId: auth.guildId },
            {
              $set: {
                authCode: auth.authCode,
                expiresAt: auth.expiresAt,
                codeShownAt: auth.codeShownAt,
                confirmedAt: auth.confirmedAt,
                isExistingPlayerLink: true,
                updatedAt: new Date(),
              },
            }
          );

          if (result.modifiedCount > 0) {
            existingPlayersLinked++;
          } else {
            log.warn(
              `⚠️  No existing player found for auth record ${auth._id} (UUID: ${auth.minecraftUuid})`
            );
          }
        } else {
          // Create new player from auth record
          await MinecraftPlayer.create({
            guildId: auth.guildId,
            minecraftUuid: auth.minecraftUuid,
            minecraftUsername: auth.minecraftUsername,
            discordId: auth.discordId,
            whitelistedAt: auth.confirmedAt, // Whitelisted when confirmed
            authCode: auth.authCode,
            expiresAt: auth.expiresAt,
            codeShownAt: auth.codeShownAt,
            confirmedAt: auth.confirmedAt,
            isExistingPlayerLink: false,
            source: "discord_link",
            createdAt: auth.createdAt,
            updatedAt: new Date(),
            lastConnectionAttempt: null,
          });
          newPlayersCreated++;
        }

        authRecordsMigrated++;

        if (authRecordsMigrated % 10 === 0) {
          log.info(`   ✅ Migrated ${authRecordsMigrated}/${pending.length} auth records...`);
        }
      } catch (error) {
        log.error(`❌ Failed to migrate auth record ${auth._id}:`, error);
      }
    }

    // Step 4: Verify migration
    const finalPlayerCount = await MinecraftPlayer.countDocuments({});

    log.info("🎉 Migration completed successfully!");
    log.info(`📈 Results:`);
    log.info(`   • Players updated: ${playersUpdated}`);
    log.info(`   • Existing players linked: ${existingPlayersLinked}`);
    log.info(`   • New players created: ${newPlayersCreated}`);
    log.info(`   • Auth records migrated: ${authRecordsMigrated}`);
    log.info(`   • Final player count: ${finalPlayerCount}`);

    // Step 5: Create backup recommendation
    log.info("");
    log.info(
      "🔒 IMPORTANT: MinecraftAuthPending collection should be backed up and removed manually after verification."
    );
    log.info("   Commands to run after testing:");
    log.info(
      "   1. db.MinecraftAuthPending.find().forEach(doc => db.MinecraftAuthPending_backup.insert(doc))"
    );
    log.info("   2. db.MinecraftAuthPending.drop()");

    return {
      success: true,
      playersUpdated,
      authRecordsMigrated,
      newPlayersCreated,
      existingPlayersLinked,
      finalPlayerCount,
    };
  } catch (error) {
    log.error("💥 Migration failed:", error);
    throw error;
  }
}

// Helper function to run migration with safety checks
export async function runMigrationSafely() {
  try {
    // Safety checks
    const hasPlayers = await MinecraftPlayer.countDocuments({});
    const hasPending = await MinecraftAuthPending.countDocuments({});

    if (hasPlayers === 0 && hasPending === 0) {
      log.warn("⚠️  No data found in either collection. Migration not needed.");
      return;
    }

    log.info("🔍 Pre-migration check:");
    log.info(`   • MinecraftPlayer records: ${hasPlayers}`);
    log.info(`   • MinecraftAuthPending records: ${hasPending}`);
    log.info("");

    // Confirm migration
    log.info("⏰ Starting migration in 5 seconds... (Ctrl+C to cancel)");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    return await mergeMinecraftCollections();
  } catch (error) {
    log.error("💥 Pre-migration check failed:", error);
    throw error;
  }
}
