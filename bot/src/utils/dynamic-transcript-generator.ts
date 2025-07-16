import {
  formatTranscriptDate,
  escapeHtml,
  getDisplayContent,
  getStaticAvatarUrl,
} from "./transcript-utils.ts";
import { generateTranscriptCSS } from "./transcript-css-generator";

/**
 * Generates HTML that exactly matches the React TranscriptViewer component
 * This ensures visual consistency between web and downloaded versions
 */
export function generateDynamicHTMLTranscript(thread: any, guildName: string): string {
  const messages = (thread.messages || []).sort(
    (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const renderMessage = (message: any, index: number): string => {
    const { displayContent, originalContent } = getDisplayContent(message);
    const staticAvatarUrl = getStaticAvatarUrl(message.authorAvatar);
    const authorName = message.type === "user" ? thread.userDisplayName : message.authorName;

    return `
      <div class="message">
        <div class="flex-shrink-0">
          ${
            staticAvatarUrl
              ? `<img src="${staticAvatarUrl}" alt="${escapeHtml(
                  authorName
                )}" class="message-avatar" />`
              : `<div class="avatar-fallback">
                <span>${escapeHtml(authorName?.charAt(0)?.toUpperCase() || "?")}</span>
               </div>`
          }
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="author-name ${message.type === "user" ? "user" : "staff"}">
              ${escapeHtml(authorName)}
            </span>
            <span class="message-badge ${message.type === "user" ? "user" : "staff"}">
              ${message.type === "user" ? "User" : "Staff"}
            </span>
            <span class="message-timestamp">${formatTranscriptDate(message.createdAt)}</span>
          </div>
          <div class="message-text">
            ${
              message.isEdited && originalContent
                ? `<span class="tooltip" title="Original message: ${escapeHtml(originalContent)}">
                   ${escapeHtml(displayContent).replace(/\n/g, "<br>")}
                   <span class="edited-indicator">(edited)</span>
                   <div class="tooltip-content">
                     <div class="tooltip-label">Original message:</div>
                     <div class="tooltip-text">${escapeHtml(originalContent).replace(
                       /\n/g,
                       "<br>"
                     )}</div>
                   </div>
                 </span>`
                : `<span>${escapeHtml(displayContent).replace(/\n/g, "<br>")}</span>
                 ${
                   message.isEdited
                     ? `<span class="edited-indicator">(edited ${
                         message.editedAt ? formatTranscriptDate(message.editedAt) : ""
                       })</span>`
                     : ""
                 }`
            }
          </div>
          ${
            message.attachments && message.attachments.length > 0
              ? `<div class="attachments">
                ${message.attachments
                  .map(
                    (attachment: any) => `
                  <div class="attachment">
                    <svg class="attachment-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span class="attachment-name">${escapeHtml(attachment.filename)}</span>
                    ${
                      attachment.url
                        ? `<a href="${attachment.url}" target="_blank" rel="noopener noreferrer" class="attachment-link">
                           <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                           </svg>
                         </a>`
                        : ""
                    }
                  </div>
                `
                  )
                  .join("")}
               </div>`
              : ""
          }
        </div>
      </div>
    `;
  };

  const renderThreadInfo = (): string => {
    return `
      <div class="thread-info">
        <h3>
          ${escapeHtml(thread.userDisplayName || "Unknown User")}
          <span class="status-badge ${
            thread.isClosed
              ? "status-closed"
              : thread.markedResolved
              ? "status-resolved"
              : "status-open"
          }">
            ${thread.isClosed ? "Closed" : thread.markedResolved ? "Resolved" : "Open"}
          </span>
          ${
            thread.markedResolved && !thread.isClosed
              ? `<span class="status-badge status-resolved">Resolved</span>`
              : ""
          }
        </h3>
        
        <div class="thread-meta">
          <div class="meta-item">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <span>Created ${formatTranscriptDate(
              thread.createdAt || thread._id?.getTimestamp()
            )}</span>
          </div>
          
          <div class="meta-item">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Last activity ${formatTranscriptDate(thread.lastUserActivityAt)}</span>
          </div>
          
          <div class="meta-item">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <span>${messages.length} messages</span>
          </div>
          
          ${
            thread.isClosed
              ? `<div class="meta-item">
                 <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                 </svg>
                 <span>Closed ${formatTranscriptDate(thread.closedAt)} ${
                  thread.closedReason ? `(${escapeHtml(thread.closedReason)})` : ""
                }</span>
               </div>`
              : ""
          }
        </div>
      </div>
    `;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modmail Transcript - ${escapeHtml(thread.userDisplayName || "Unknown User")}</title>
    <style>
        ${generateTranscriptCSS()}
    </style>
</head>
<body>
    <div class="transcript-container">
        <!-- Header matching React component -->
        <div class="transcript-header">
            <div class="transcript-title">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="display: inline; margin-right: 12px; vertical-align: middle;">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Conversation Transcript
            </div>
            <div class="transcript-server">${escapeHtml(guildName || "Unknown Server")}</div>
        </div>
        
        <!-- Thread Info matching React component -->
        ${renderThreadInfo()}
        
        <!-- Messages matching React component exactly -->
        <div class="messages-container">
            <div class="messages-title">Conversation</div>
            
            ${
              messages.length > 0
                ? `<div class="messages-list">
                   ${messages
                     .map((message: any, index: number) => renderMessage(message, index))
                     .join("")}
                 </div>`
                : `<div class="no-messages">
                   <svg class="no-messages-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                   </svg>
                   <p class="no-messages-text">No messages found in this conversation.</p>
                 </div>`
            }
        </div>
        
        <!-- Footer with generation info -->
        <div class="footer">
            <p>Transcript generated on ${formatTranscriptDate(new Date())}</p>
            <p>Generated by Heimdall Bot Dashboard</p>
        </div>
    </div>
</body>
</html>`;
}
