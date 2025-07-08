import { Attachment, AttachmentBuilder, Collection } from "discord.js";

/**
 * Creates AttachmentBuilder objects from Discord attachment URLs
 * This allows forwarding attachments without downloading and re-uploading them
 * @deprecated Use processAttachmentsForModmail from AttachmentSizeManager for size-aware processing
 */
export function createAttachmentBuildersFromUrls(
  attachments: Collection<string, Attachment>
): AttachmentBuilder[] {
  const attachmentBuilders: AttachmentBuilder[] = [];

  for (const attachment of attachments.values()) {
    const attachmentBuilder = new AttachmentBuilder(attachment.url, {
      name: attachment.name || "attachment",
      description: attachment.description || undefined,
    });
    attachmentBuilders.push(attachmentBuilder);
  }

  return attachmentBuilders;
}

/**
 * Creates AttachmentBuilder objects from Discord attachment URLs with size filtering
 * Only includes attachments that are 8MB or smaller (Discord's limit)
 */
export function createSmallAttachmentBuildersFromUrls(
  attachments: Collection<string, Attachment>
): AttachmentBuilder[] {
  const attachmentBuilders: AttachmentBuilder[] = [];
  const DISCORD_FILE_LIMIT = 8 * 1024 * 1024; // 8MB

  for (const attachment of attachments.values()) {
    if (attachment.size <= DISCORD_FILE_LIMIT) {
      const attachmentBuilder = new AttachmentBuilder(attachment.url, {
        name: attachment.name || "attachment",
        description: attachment.description || undefined,
      });
      attachmentBuilders.push(attachmentBuilder);
    }
  }

  return attachmentBuilders;
}
