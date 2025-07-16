// Modern CSS generator for transcript HTML downloads

export function generateTranscriptCSS(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
      background: hsl(222.2, 84%, 4.9%);
      color: hsl(210, 40%, 98%);
      line-height: 1.6;
      min-height: 100vh;
      padding: 24px;
    }

    .transcript-container {
      max-width: 900px;
      margin: 0 auto;
      background: hsl(222.2, 84%, 4.9%);
      border: 1px solid hsl(217.2, 32.6%, 17.5%);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .transcript-header {
      background: hsl(217.2, 32.6%, 17.5%);
      color: hsl(210, 40%, 98%);
      padding: 32px;
      text-align: center;
      border-bottom: 1px solid hsl(217.2, 32.6%, 17.5%);
    }

    .transcript-title {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .transcript-server {
      font-size: 18px;
      opacity: 0.9;
      font-weight: 500;
      color: hsl(215, 20.2%, 65.1%);
    }

    .thread-info {
      background: hsl(222.2, 84%, 4.9%);
      padding: 28px 32px;
      border-bottom: 1px solid hsl(217.2, 32.6%, 17.5%);
    }

    .thread-info h3 {
      color: hsl(210, 40%, 98%);
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .thread-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      color: hsl(215, 20.2%, 65.1%);
      font-weight: 500;
    }

    .meta-item svg {
      width: 18px;
      height: 18px;
      color: hsl(215, 20.2%, 65.1%);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      border-radius: 25px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .status-open {
      background: #3ba55d;
      color: white;
    }

    .status-closed {
      background: #ed4245;
      color: white;
    }

    .status-resolved {
      background: #faa61a;
      color: white;
    }

    .messages-container {
      padding: 0;
    }

    .messages-title {
      background: hsl(217.2, 32.6%, 17.5%);
      padding: 20px 32px;
      font-size: 20px;
      font-weight: 700;
      color: hsl(210, 40%, 98%);
      border-bottom: 1px solid hsl(217.2, 32.6%, 17.5%);
    }

    .messages-list {
      padding: 32px;
      background: hsl(222.2, 84%, 4.9%);
    }

    .message {
      display: flex;
      gap: 18px;
      margin-bottom: 24px;
      padding: 20px;
      border-radius: 16px;
      background: hsl(217.2, 32.6%, 17.5%);
      border: 1px solid hsl(217.2, 32.6%, 17.5%);
      transition: all 0.3s ease;
    }

    .message:hover {
      background: hsl(217.2, 32.6%, 20%);
      border-color: hsl(217.2, 32.6%, 25%);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      transform: translateY(-2px);
    }

    .message:last-child {
      margin-bottom: 0;
    }

    .message-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 2px solid hsl(217.2, 32.6%, 25%);
      object-fit: cover;
    }

    .avatar-fallback {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #5865f2;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
      border: 2px solid hsl(217.2, 32.6%, 25%);
    }

    .message-content {
      flex: 1;
      min-width: 0;
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .author-name {
      font-weight: 700;
      font-size: 16px;
    }

    .author-name.user {
      color: #5865f2;
    }

    .author-name.staff {
      color: #3ba55d;
    }

    .message-badge {
      padding: 4px 10px;
      border-radius: 15px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .message-badge.user {
      background: #5865f2;
      color: white;
    }

    .message-badge.staff {
      background: #3ba55d;
      color: white;
    }

    .message-timestamp {
      font-size: 13px;
      color: hsl(215, 20.2%, 65.1%);
      font-weight: 600;
    }

    .message-text {
      color: hsl(210, 40%, 98%);
      font-size: 16px;
      line-height: 1.7;
      word-wrap: break-word;
    }

    .edited-indicator {
      font-size: 12px;
      color: hsl(215, 20.2%, 65.1%);
      font-style: italic;
      margin-left: 8px;
      font-weight: 500;
    }

    .tooltip {
      position: relative;
      display: inline;
      cursor: help;
      border-bottom: 2px dotted hsl(215, 20.2%, 65.1%);
    }

    .tooltip .tooltip-content {
      visibility: hidden;
      width: 320px;
      background: hsl(217.2, 32.6%, 17.5%);
      color: hsl(210, 40%, 98%);
      text-align: left;
      border-radius: 12px;
      padding: 16px;
      position: absolute;
      z-index: 1000;
      bottom: 125%;
      left: 50%;
      margin-left: -160px;
      opacity: 0;
      transition: opacity 0.4s ease;
      border: 1px solid hsl(217.2, 32.6%, 25%);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
      font-size: 14px;
    }

    .tooltip .tooltip-content::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      margin-left: -8px;
      border-width: 8px;
      border-style: solid;
      border-color: hsl(217.2, 32.6%, 25%) transparent transparent transparent;
    }

    .tooltip:hover .tooltip-content {
      visibility: visible;
      opacity: 1;
    }

    .tooltip-label {
      font-weight: 700;
      color: hsl(215, 20.2%, 65.1%);
      margin-bottom: 8px;
      font-size: 13px;
    }

    .tooltip-text {
      line-height: 1.5;
    }

    .attachments {
      margin-top: 16px;
    }

    .attachment {
      background: hsl(217.2, 32.6%, 20%);
      border: 1px solid hsl(217.2, 32.6%, 25%);
      border-radius: 12px;
      padding: 16px;
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
      transition: all 0.2s ease;
    }

    .attachment:hover {
      background: hsl(217.2, 32.6%, 25%);
      border-color: hsl(217.2, 32.6%, 30%);
    }

    .attachment-icon {
      width: 22px;
      height: 22px;
      color: hsl(215, 20.2%, 65.1%);
      flex-shrink: 0;
    }

    .attachment-name {
      flex: 1;
      color: hsl(210, 40%, 98%);
      font-weight: 600;
    }

    .attachment-link {
      color: #5865f2;
      text-decoration: none;
      padding: 6px;
      border-radius: 6px;
      transition: background-color 0.2s;
      font-weight: 600;
    }

    .attachment-link:hover {
      background: rgba(88, 101, 242, 0.1);
    }

    .no-messages {
      text-align: center;
      padding: 80px 32px;
      color: hsl(215, 20.2%, 65.1%);
    }

    .no-messages-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 20px;
      color: hsl(215, 20.2%, 65.1%);
    }

    .no-messages-text {
      font-size: 18px;
      margin: 0;
      font-weight: 500;
    }

    .footer {
      background: hsl(217.2, 32.6%, 17.5%);
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid hsl(217.2, 32.6%, 25%);
      color: hsl(215, 20.2%, 65.1%);
      font-size: 14px;
      font-weight: 500;
    }

    .footer p {
      margin: 6px 0;
    }

    @media print {
      body {
        background: hsl(222.2, 84%, 4.9%);
        padding: 0;
      }
      
      .transcript-container {
        box-shadow: none;
        border: 1px solid hsl(217.2, 32.6%, 17.5%);
      }
      
      .message:hover {
        background: hsl(217.2, 32.6%, 17.5%) !important;
        box-shadow: none !important;
        transform: none !important;
      }
      
      .tooltip .tooltip-content {
        display: none !important;
      }
    }
  `;
}
