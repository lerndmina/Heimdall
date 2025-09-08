export enum VoteType {
  Upvote = "upvote",
  Downvote = "downvote",
}

export enum SuggestionStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
}

export interface SuggestionUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string | null;
  globalName?: string;
}

export interface Vote {
  userId: string;
  vote: VoteType;
}

export interface Suggestion {
  id: string;
  title: string;
  suggestion: string;
  reason: string;
  userId: string;
  user?: SuggestionUser;
  status: SuggestionStatus;
  votes: Vote[];
  messageLink: string;
  managedBy?: string;
  guildId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SuggestionsResponse {
  success: boolean;
  data: Suggestion[];
  message?: string;
  requestId?: string;
}
