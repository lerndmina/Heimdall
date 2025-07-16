// Utility functions for bot-side transcript generation

/**
 * Convert animated Discord avatars to static versions
 */
export function getStaticAvatarUrl(avatarUrl?: string): string | undefined {
  if (!avatarUrl) return undefined;

  // If it's an animated avatar (starts with a_), convert to static
  if (avatarUrl.includes("a_")) {
    return avatarUrl.replace(/\.gif(\?.*)?$/, ".png$1").replace(/a_/, "");
  }

  // If it's already static or not a Discord CDN URL, return as-is
  return avatarUrl;
}

/**
 * Format date consistently across transcript views
 */
export function formatTranscriptDate(date: string | Date): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Escape HTML characters for safe insertion into HTML
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Get message content for display (edited content if available, original if not)
 */
export function getDisplayContent(message: {
  content: string;
  editedContent?: string;
  isEdited?: boolean;
}): { displayContent: string; originalContent?: string } {
  if (message.isEdited && message.editedContent) {
    return {
      displayContent: message.editedContent,
      originalContent: message.content,
    };
  }
  return {
    displayContent: message.content,
  };
}

/**
 * Format attachment size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

/**
 * Check if file is an image based on extension
 */
export function isImageFile(filename: string): boolean {
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
  return imageExtensions.includes(getFileExtension(filename));
}

/**
 * Generate a fallback avatar with initials
 */
export function generateFallbackAvatar(name: string): string {
  const initial = name?.charAt(0)?.toUpperCase() || "?";
  return `data:image/svg+xml;base64,${btoa(`
    <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" fill="#7289da" rx="24"/>
      <text x="24" y="32" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="600" fill="white">
        ${initial}
      </text>
    </svg>
  `)}`;
}

/**
 * Clean and validate URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Format message for display with proper line breaks
 */
export function formatMessageContent(content: string): string {
  return content
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/__(.*?)__/g, "<u>$1</u>")
    .replace(/~~(.*?)~~/g, "<del>$1</del>");
}
