import { Attachment, AttachmentBuilder, Collection, Message } from "discord.js";
import ZiplineService from "../services/ZiplineService";
import FetchEnvs, { envExists } from "./FetchEnvs";
import log from "./log";
import { tryCatch } from "./trycatch";
import { ModmailEmbeds } from "./modmail/ModmailEmbeds";

const env = FetchEnvs();

// File size constants (in bytes)
const DISCORD_FILE_LIMIT = 8 * 1024 * 1024; // 8MB
const ZIPLINE_MAX_SIZE = 95 * 1024 * 1024; // 95MB

interface ProcessedAttachment {
  type: "discord" | "zipline" | "rejected";
  attachment?: AttachmentBuilder;
  message?: string;
  error?: string;
  originalAttachment: Attachment;
}

interface AttachmentProcessingResult {
  discordAttachments: AttachmentBuilder[];
  ziplineMessages: string[];
  rejectedMessages: string[];
  hasLargeFiles: boolean;
  allSuccessful: boolean;
}

/**
 * Enhanced attachment processing with improved error handling and proper timestamp formatting
 * - Uses tryCatch utility for consistent error handling
 * - Properly handles Zipline deletesAt ISO timestamp
 * - Better user feedback with detailed error messages
 * - Robust file download and upload processing
 */
export async function processAttachmentsForModmail(
  attachments: Collection<string, Attachment>,
  message?: Message,
  isStaffMessage: boolean = false
): Promise<AttachmentProcessingResult> {
  const result: AttachmentProcessingResult = {
    discordAttachments: [],
    ziplineMessages: [],
    rejectedMessages: [],
    hasLargeFiles: false,
    allSuccessful: true,
  };

  if (attachments.size === 0) {
    return result;
  }

  // Check if we have large files that need processing
  const hasLargeFiles = Array.from(attachments.values()).some(
    (att) => att.size > DISCORD_FILE_LIMIT
  );

  // Add loading reaction if there are large files to process (only for user messages)
  if (hasLargeFiles && message && !isStaffMessage) {
    const { error: reactionError } = await tryCatch(message.react("⏳"));
    if (reactionError) {
      log.warn("Failed to add loading reaction:", reactionError);
    }
  }

  // Check if Zipline is configured
  const hasZiplineConfig = envExists(env.ZIPLINE_BASEURL) && envExists(env.ZIPLINE_TOKEN);
  let ziplineService: ZiplineService | null = null;

  if (hasZiplineConfig) {
    try {
      ziplineService = await ZiplineService.create(env.ZIPLINE_TOKEN, env.ZIPLINE_BASEURL);
      if (!ziplineService.isReady()) {
        log.warn("Zipline service is not ready, falling back to error messages for large files");
        ziplineService = null;
      }
    } catch (error) {
      log.error("Failed to initialize Zipline service:", error);
      ziplineService = null;
    }
  }

  for (const attachment of attachments.values()) {
    const processed = await processAttachment(attachment, ziplineService);

    switch (processed.type) {
      case "discord":
        if (processed.attachment) {
          result.discordAttachments.push(processed.attachment);
        }
        break;
      case "zipline":
        if (processed.message) {
          result.ziplineMessages.push(processed.message);
          result.hasLargeFiles = true;
        }
        break;
      case "rejected":
        if (processed.error) {
          result.rejectedMessages.push(processed.error);
          result.allSuccessful = false;
        }
        break;
    }
  }

  // Remove loading reaction and add final status reaction (only for user messages)
  if (hasLargeFiles && message && !isStaffMessage) {
    // Remove loading reaction
    const loadingReaction = message.reactions.resolve("⏳");
    if (loadingReaction) {
      const { error: removeReactionError } = await tryCatch(
        loadingReaction.users.remove(message.client.user)
      );
      if (removeReactionError) {
        log.warn("Failed to remove loading reaction:", removeReactionError);
      }
    }

    // Add final status reaction
    const reactionEmoji = result.allSuccessful ? "📨" : "⚠️";
    const { error: statusReactionError } = await tryCatch(message.react(reactionEmoji));
    if (statusReactionError) {
      log.warn("Failed to update status reaction:", statusReactionError);
    }
  }

  return result;
}

/**
 * Process a single attachment based on its size
 */
async function processAttachment(
  attachment: Attachment,
  ziplineService: ZiplineService | null
): Promise<ProcessedAttachment> {
  const fileSize = attachment.size;
  const fileName = attachment.name || "attachment";

  // Small files go directly to Discord
  if (fileSize <= DISCORD_FILE_LIMIT) {
    return {
      type: "discord",
      attachment: new AttachmentBuilder(attachment.url, {
        name: fileName,
        description: attachment.description || undefined,
      }),
      originalAttachment: attachment,
    };
  }

  // Files too large for Zipline
  if (fileSize > ZIPLINE_MAX_SIZE) {
    return {
      type: "rejected",
      error: ModmailEmbeds.fileTooLargeOverall(fileName, formatFileSize(fileSize)),
      originalAttachment: attachment,
    };
  }

  // Medium files (8MB - 95MB) - try Zipline
  if (!ziplineService) {
    return {
      type: "rejected",
      error: ModmailEmbeds.fileTooLargeForDiscord(fileName, formatFileSize(fileSize)),
      originalAttachment: attachment,
    };
  }

  // Download the file and upload to Zipline with enhanced error handling
  const { data: downloadResponse, error: downloadError } = await tryCatch(fetch(attachment.url));
  if (downloadError || !downloadResponse?.ok) {
    log.error(
      `Failed to download ${fileName}:`,
      downloadError || `${downloadResponse?.status} ${downloadResponse?.statusText}`
    );
    return {
      type: "rejected",
      error: ModmailEmbeds.fileDownloadFailed(fileName, formatFileSize(fileSize)),
      originalAttachment: attachment,
    };
  }

  const { data: arrayBuffer, error: arrayBufferError } = await tryCatch(
    downloadResponse.arrayBuffer()
  );
  if (arrayBufferError) {
    log.error(`Failed to get array buffer for ${fileName}:`, arrayBufferError);
    return {
      type: "rejected",
      error: ModmailEmbeds.fileProcessingFailed(fileName, formatFileSize(fileSize)),
      originalAttachment: attachment,
    };
  }

  const fileBuffer = Buffer.from(arrayBuffer);

  const { data: uploadResult, error: uploadError } = await tryCatch(
    ziplineService.uploadFile(fileBuffer, fileName, {
      maxDays: 30, // 30 day expiry as requested
      embed: false,
    })
  );

  if (uploadError) {
    log.error(`Failed to upload ${fileName} to Zipline:`, uploadError);
    return {
      type: "rejected",
      error: ModmailEmbeds.fileUploadFailed(fileName, formatFileSize(fileSize)),
      originalAttachment: attachment,
    };
  }

  if (!uploadResult?.files || uploadResult.files.length === 0) {
    log.error(`No files returned from Zipline upload for ${fileName}`);
    return {
      type: "rejected",
      error: ModmailEmbeds.fileUploadFailed(fileName, formatFileSize(fileSize)),
      originalAttachment: attachment,
    };
  }

  const uploadedFile = uploadResult.files[0];

  // Handle deletesAt properly - it's already an ISO timestamp string
  let expiryMessage = "30 days";
  if (uploadResult.deletesAt) {
    try {
      const expiryDate = new Date(uploadResult.deletesAt);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        expiryMessage = `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
      } else {
        expiryMessage = "soon";
      }
    } catch (error) {
      log.warn(`Failed to parse deletesAt timestamp: ${uploadResult.deletesAt}`, error);
      // Fallback to the raw timestamp formatted nicely
      expiryMessage = uploadResult.deletesAt.split("T")[0]; // Just the date part
    }
  }

  return {
    type: "zipline",
    message:
      `📎 **${fileName}** (${formatFileSize(fileSize)}) - [Download Link](${uploadedFile.url})\n` +
      `⏰ **Expires in ${expiryMessage}**`,
    originalAttachment: attachment,
  };
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Create a message explaining file upload results for moderator thread
 * Only shows successful large file uploads, not rejections
 */
export function createFileUploadSummary(result: AttachmentProcessingResult): string | null {
  const messages: string[] = [];

  // Only show successful large file uploads to moderators
  if (result.ziplineMessages.length === 0) return null;

  messages.push(`⚠️ **Large files expire in 30 days**`);
  messages.push(...result.ziplineMessages);

  return messages.join("\n");
}

/**
 * Create a message explaining file upload results for user DMs
 * Only shows rejected/failed files that the user needs to know about
 */
export function createUserFileUploadFeedback(
  result: AttachmentProcessingResult,
  isFromStaff: boolean = false
): string | null {
  // Only show rejected files to users - they don't need to know about successful uploads
  if (result.rejectedMessages.length === 0) return null;

  const messages: string[] = [];
  messages.push(`❌ **Some files couldn't be uploaded:**`);
  messages.push(...result.rejectedMessages);

  return messages.join("\n\n");
}

/**
 * Create a message explaining what files are being processed
 */
export function createFileProcessingStatus(
  attachments: Collection<string, Attachment>
): string | null {
  if (attachments.size === 0) return null;

  const smallFiles: string[] = [];
  const largeFiles: string[] = [];
  const tooLargeFiles: string[] = [];

  for (const attachment of attachments.values()) {
    const fileName = attachment.name || "attachment";
    const fileSize = formatFileSize(attachment.size);

    if (attachment.size <= DISCORD_FILE_LIMIT) {
      smallFiles.push(`✅ ${fileName} (${fileSize})`);
    } else if (attachment.size <= ZIPLINE_MAX_SIZE) {
      largeFiles.push(`⏳ ${fileName} (${fileSize}) - uploading to secure storage...`);
    } else {
      tooLargeFiles.push(`❌ ${fileName} (${fileSize}) - too large (max 95MB)`);
    }
  }

  const messages: string[] = [];

  if (smallFiles.length > 0) {
    messages.push(`**Files uploaded to Discord:**\n${smallFiles.join("\n")}`);
  }

  if (largeFiles.length > 0) {
    messages.push(`**Large files being processed:**\n${largeFiles.join("\n")}`);
  }

  if (tooLargeFiles.length > 0) {
    messages.push(
      `**Files too large:**\n${tooLargeFiles.join("\n")}\n${ModmailEmbeds.fileUploadFallbackShort}`
    );
  }

  return messages.length > 0 ? messages.join("\n\n") : null;
}
