/**
 * Shared formatter for staff → user DM relay messages.
 * Keeps formatting consistent across normal replies and close-with-final-message replies.
 */
export function formatStaffReply(content: string, staffName: string, guildName: string): string {
  return (
    `**${staffName}:**\n${content}\n\n` +
    `-# This message was sent by the staff of ${guildName} in response to your modmail.\n` +
    `-# To reply, simply send a message in this DM.\n` +
    `-# If you want to close this thread, just click the close button above.`
  );
}
