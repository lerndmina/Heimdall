export interface ApplicationMessageContext {
  userId: string;
  userDisplayName?: string;
  formName?: string;
  applicationId?: string;
  applicationNumber?: number;
  status?: "pending" | "approved" | "denied";
  reason?: string;
  reviewerId?: string;
  guildId?: string;
}

export interface ApplicationMessageEmbedTemplate {
  title?: string | null;
  description?: string | null;
  color?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  footer?: string | null;
}

function normalizeReason(reason?: string): string {
  const text = reason?.trim();
  return text && text.length > 0 ? text : "No reason provided.";
}

export function formatApplicationMessage(template: string, context: ApplicationMessageContext): string {
  if (!template || typeof template !== "string") return "";

  const replacements: Record<string, string> = {
    user_mention: context.userId ? `<@${context.userId}>` : "",
    user_id: context.userId || "",
    user_name: context.userDisplayName || "",
    form_name: context.formName || "",
    application_id: context.applicationId || "",
    application_number: typeof context.applicationNumber === "number" ? String(context.applicationNumber) : "",
    status: context.status || "",
    reason: normalizeReason(context.reason),
    reviewer_mention: context.reviewerId ? `<@${context.reviewerId}>` : "",
    reviewer_id: context.reviewerId || "",
    guild_id: context.guildId || "",
  };

  return template.replace(/\{([a-z_]+)\}/gi, (full, key) => {
    const replacement = replacements[String(key).toLowerCase()];
    return replacement !== undefined ? replacement : full;
  });
}

export function formatApplicationMessageEmbed(template: ApplicationMessageEmbedTemplate | null | undefined, context: ApplicationMessageContext): ApplicationMessageEmbedTemplate {
  if (!template || typeof template !== "object") return {};

  return {
    title: template.title ? formatApplicationMessage(template.title, context) : undefined,
    description: template.description ? formatApplicationMessage(template.description, context) : undefined,
    color: template.color || undefined,
    image: template.image ? formatApplicationMessage(template.image, context) : undefined,
    thumbnail: template.thumbnail ? formatApplicationMessage(template.thumbnail, context) : undefined,
    footer: template.footer ? formatApplicationMessage(template.footer, context) : undefined,
  };
}

export function hasApplicationMessageEmbedContent(template: ApplicationMessageEmbedTemplate | null | undefined): boolean {
  if (!template || typeof template !== "object") return false;
  return [template.title, template.description, template.color, template.image, template.thumbnail, template.footer].some((value) => typeof value === "string" && value.trim().length > 0);
}

export const APPLICATION_MESSAGE_PLACEHOLDERS = [
  "{user_mention}",
  "{user_id}",
  "{user_name}",
  "{form_name}",
  "{application_id}",
  "{application_number}",
  "{status}",
  "{reason}",
  "{reviewer_mention}",
  "{reviewer_id}",
  "{guild_id}",
] as const;
