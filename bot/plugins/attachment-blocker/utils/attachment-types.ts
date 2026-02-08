/**
 * Attachment type definitions and MIME type resolution map.
 * Ported from the legacy AttachmentBlocker model.
 */

export enum AttachmentType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  ALL = "all",
  NONE = "none",
}

/**
 * Maps each AttachmentType to the MIME types it covers.
 * VIDEO includes animated image types (gif, apng, animated webp).
 */
export const AttachmentTypesResolved: Record<AttachmentType, string[]> = {
  [AttachmentType.IMAGE]: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/tif",
    "image/svg+xml",
    "image/ico",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/jxl",
  ],
  [AttachmentType.VIDEO]: [
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
    "video/x-flv",
    "video/3gpp",
    "video/3gpp2",
    "video/x-matroska",
    "image/gif",
    "image/apng",
    "image/webp",
  ],
  [AttachmentType.AUDIO]: [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/ogg",
    "audio/flac",
    "audio/x-flac",
    "audio/x-m4a",
    "audio/mp4",
    "audio/aac",
    "audio/x-aac",
    "audio/x-ms-wma",
    "audio/opus",
    "audio/webm",
    "audio/3gpp",
    "audio/3gpp2",
    "audio/amr",
    "audio/x-ms-wax",
  ],
  [AttachmentType.ALL]: ["all"],
  [AttachmentType.NONE]: ["none"],
};

/** Human-readable labels for each attachment type */
export const AttachmentTypeLabels: Record<AttachmentType, string> = {
  [AttachmentType.IMAGE]: "Images",
  [AttachmentType.VIDEO]: "Videos & GIFs",
  [AttachmentType.AUDIO]: "Audio",
  [AttachmentType.ALL]: "All Attachments",
  [AttachmentType.NONE]: "No Attachments",
};

/**
 * Check whether a given MIME type is covered by a set of allowed attachment types.
 */
export function isMimeTypeAllowed(mimeType: string, allowedTypes: AttachmentType[]): boolean {
  if (allowedTypes.includes(AttachmentType.ALL)) return true;
  if (allowedTypes.includes(AttachmentType.NONE)) return false;

  const lower = mimeType.toLowerCase();
  for (const type of allowedTypes) {
    const resolved = AttachmentTypesResolved[type];
    if (resolved && resolved.includes(lower)) return true;
  }
  return false;
}
