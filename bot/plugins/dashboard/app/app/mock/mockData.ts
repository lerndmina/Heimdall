export const mockData = {
  overviewStats: {
    totalServers: 142,
    totalUsers: 45200,
    uptime: "99.99%",
    commandsRun: 1250000,
    activeVoice: 340,
    messagesToday: 85000,
  },
  plugins: [
    { id: "attachment-blocker", name: "Attachment Blocker", enabled: true, description: "Block specific file types in channels." },
    { id: "modmail", name: "Modmail", enabled: true, description: "DM-based support ticket system." },
    { id: "logging", name: "Logging", enabled: true, description: "Comprehensive server audit logs." },
    { id: "welcome", name: "Welcome", enabled: false, description: "Greet new members with custom messages." },
    { id: "leveling", name: "Leveling", enabled: true, description: "XP and role rewards for activity." },
  ],
  analytics: {
    messageVolume: [
      { day: "Mon", count: 12000 },
      { day: "Tue", count: 15000 },
      { day: "Wed", count: 14000 },
      { day: "Thu", count: 18000 },
      { day: "Fri", count: 22000 },
      { day: "Sat", count: 25000 },
      { day: "Sun", count: 20000 },
    ],
    topCommands: [
      { name: "/help", uses: 4500 },
      { name: "/play", uses: 3200 },
      { name: "/ban", uses: 850 },
      { name: "/ping", uses: 600 },
    ],
  },
  users: [
    { id: "1", username: "Alice", discriminator: "1234", roles: ["Admin", "Moderator"], status: "online", joinedAt: "2023-01-15" },
    { id: "2", username: "Bob", discriminator: "5678", roles: ["Member"], status: "idle", joinedAt: "2023-05-20" },
    { id: "3", username: "Charlie", discriminator: "9012", roles: ["VIP", "Member"], status: "dnd", joinedAt: "2022-11-10" },
    { id: "4", username: "Diana", discriminator: "3456", roles: ["Moderator"], status: "offline", joinedAt: "2024-02-01" },
    { id: "5", username: "Eve", discriminator: "7890", roles: ["Member"], status: "online", joinedAt: "2024-03-15" },
  ],
  auditLogs: [
    { id: "101", action: "MEMBER_BAN_ADD", actor: "Alice#1234", target: "Spammer#9999", reason: "Spamming links", timestamp: "10 mins ago" },
    { id: "102", action: "CHANNEL_CREATE", actor: "Alice#1234", target: "#announcements", reason: "New category", timestamp: "1 hour ago" },
    { id: "103", action: "ROLE_UPDATE", actor: "Diana#3456", target: "@VIP", reason: "Changed color", timestamp: "3 hours ago" },
    { id: "104", action: "MESSAGE_DELETE", actor: "System", target: "Bob#5678", reason: "Automod: Swearing", timestamp: "5 hours ago" },
    { id: "105", action: "MEMBER_KICK", actor: "Charlie#9012", target: "Troll#1111", reason: "Trolling in VC", timestamp: "1 day ago" },
  ],
};
