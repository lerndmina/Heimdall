import { ChannelType } from "discord.js";

const guildMediaType = (ChannelType as unknown as Record<string, number>).GuildMedia;

const optionalGuildMediaTypes: ChannelType[] = typeof guildMediaType === "number" ? [guildMediaType as ChannelType] : [];

export const DASHBOARD_TEXT_CHANNEL_TYPES: ChannelType[] = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
  ...optionalGuildMediaTypes,
];

export const ATTACHMENT_BLOCKER_SUPPORTED_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
  ChannelType.GuildVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
] as const;

const attachmentBlockerSupportedChannelTypeSet = new Set<number>(ATTACHMENT_BLOCKER_SUPPORTED_CHANNEL_TYPES);

export function isAttachmentBlockerSupportedChannelType(channelType: number): boolean {
  return attachmentBlockerSupportedChannelTypeSet.has(channelType);
}
