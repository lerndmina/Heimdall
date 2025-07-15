import { InteractionReplyOptions, MessageCreateOptions, MessageEditOptions } from "discord.js";

export interface DiscohookData {
  messages: [
    {
      data: MessageCreateOptions | MessageEditOptions;
    }
  ];
}

export interface MessageProcessorResult {
  success: boolean;
  error?: string;
  data?: InteractionReplyOptions;
}

export interface ShortLinkResponse {
  url: string;
  success: boolean;
  error?: string;
}
