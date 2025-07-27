- The settings button in the staff dashoard should require admin perms on the discord not just the staff role.
- Add a stats tab in place of the modmail tab to show stats about tickets like:
  - Total tickets created
  - Total tickets closed
  - Average time to close a ticket
  - Most active staff member
  - Average time to first response

Core Utilities

1. Customizable Bot Prefix & Commands
   • Allow server admins to change command prefix
   • `/help` command listing available features
2. Embedded Rich Messages
   • Unified embed style (colors, footers, icons)
   • Templates for announcements, logs, errors, confirmations
3. Customer Count & Stats
   • Live “customer” count from FiveM server

Community Engagement

1. Giveaway System
   • `/giveaway start [prize] [duration] [winners]`
   • Automatic winner selection and announcement embed
2. Media & Social Feed
   • Auto‑post new content from Twitter, Instagram, YouTube
   • Configurable RSS/webhook integration

Support & Ticketing

1. Ticket Creation & Routing
   • Ticket creation for different types of tickets
   • Pre‑open form to collect user info (name, issue type, brief description)
2. Ticket Management
   • `/ticket rename <new-name>`
   • `/ticket add @user` / `/ticket remove @user`
   • `/ticket close` → prompts for satisfaction rating
   • Auto remind and ‑archive closed tickets after configurable period
3. Role‑Based Access & Tebex Integration
   • `/role assign <@user> <TBX-ID>` (Senior Support only)
   • `/purchase validate <code>` verifies via Tebex API (Support+ only)
   • Auto‑assign purchaser role on successful validation or through a claiming system
4. A way to close ticket creation on certain times/days (based on ticket type)
5. Total ticket count and some admin insights to monitor support activity, like total tickets per person, average stars rated per person and so on

Moderation & Safety

1. Anti‑Spam / AutoMod Enhancements
   • Rate‑limit mass‑mention, invite links
   • Configurable thresholds and punishments (mute, warn, kick)
2. Logging & Audit
   • Log deleted/edited messages, role changes, joins/leaves
   • `/mod logs` with filters (user, channel, action)
3. Reaction Roles
   • Self‑assignable roles via reaction menus (This would also be possible by discord itself)

AI‑Powered Helper

1. Knowledge‑Base Bot
   • Integrate with GitBook or docs via AI for FAQs (`/kb <question>`)
   • AI response with source link
2. Auto‑Response in Tickets
   • Suggest article snippets based on ticket content
   • “Did you mean…” prompts before human replies

Feedback & Reporting

1. Post‑Ticket Rating
   • After `/ticket close`, prompt user to rate support (1–5 stars) and comment
   • Auto‑post summary in `#ratings` channel

Optional Nice‑to‑Haves
• Custom Welcome & Farewell messages
• I am a fan of AI so any cool feature that would save time is welcome
