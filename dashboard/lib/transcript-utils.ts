// Utility functions for transcript formatting

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
 * Escape HTML characters
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Get message content for display (edited content if available, original if not)
 */
export function getDisplayContent(message: { content: string; editedContent?: string; isEdited?: boolean }): { displayContent: string; originalContent?: string } {
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
 * Generate shared CSS styles for transcript formatting
 */
export function getTranscriptStyles(): string {
  return `
    .transcript-container {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
    }
    .transcript-message {
      margin-bottom: 20px;
      display: flex;
      align-items: flex-start;
      gap: 15px;
    }
    .transcript-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #7289da;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      flex-shrink: 0;
    }
    .transcript-message-content {
      flex: 1;
    }
    .transcript-message-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 5px;
    }
    .transcript-author-name {
      font-weight: 600;
    }
    .transcript-timestamp {
      font-size: 0.75rem;
      opacity: 0.7;
    }
    .transcript-message-text {
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .transcript-edited-content {
      position: relative;
      cursor: help;
    }
    .transcript-edited-indicator {
      font-size: 0.75rem;
      opacity: 0.7;
      margin-left: 5px;
    }
    .transcript-attachments {
      margin-top: 10px;
    }
    .transcript-attachment {
      background: rgba(79, 84, 92, 0.16);
      border: 1px solid rgba(79, 84, 92, 0.48);
      border-radius: 4px;
      padding: 10px;
      margin-top: 5px;
      font-size: 0.9rem;
    }
    
    /* Tooltip styles */
    .tooltip {
      position: relative;
      display: inline;
    }
    .tooltip .tooltip-content {
      visibility: hidden;
      width: 300px;
      background-color: #2f3136;
      color: #dcddde;
      text-align: left;
      border-radius: 6px;
      padding: 10px;
      position: absolute;
      z-index: 1000;
      bottom: 125%;
      left: 50%;
      margin-left: -150px;
      opacity: 0;
      transition: opacity 0.3s;
      border: 1px solid #4f545c;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .tooltip .tooltip-content::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      margin-left: -5px;
      border-width: 5px;
      border-style: solid;
      border-color: #4f545c transparent transparent transparent;
    }
    .tooltip:hover .tooltip-content {
      visibility: visible;
      opacity: 1;
    }
  `;
}
