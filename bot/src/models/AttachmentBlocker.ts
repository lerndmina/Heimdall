import { InferSchemaType, Schema, model } from "mongoose";

export enum AttachmentType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  ALL = "all",
  NONE = "none", // Used for no attachments allowed
}

export const AttachmentTypesResolved = {
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
    "video/x-msvideo", // AVI
    "video/x-ms-wmv", // WMV
    "video/x-flv", // FLV
    "video/3gpp",
    "video/3gpp2",
    "video/x-matroska", // MKV
    "image/gif",
    "image/apng",
    "image/webp", // WebP can be animated
  ], // Including GIF and APNG as video types
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
    "audio/mp4", // M4A files sometimes use this
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
  [AttachmentType.NONE]: ["none"], // Used to block all attachments
};

const AttachmentBlocker = new Schema({
  channelId: {
    type: String,
    required: true,
    unique: true, // Prevent duplicate configurations for the same channel
    index: true, // Improve lookup performance
  },
  attachmentTypes: {
    type: [String],
    enum: Object.values(AttachmentType),
    default: [],
  },
  createdBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  timeoutDuration: {
    type: Number,
    default: 0,
  },
});

export default model("AttachmentBlocker", AttachmentBlocker);

export type AttachmentBlockerType = InferSchemaType<typeof AttachmentBlocker>;
