"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { BarChart3, LayoutDashboard, ScrollText, Settings, Users } from "lucide-react";
import { mockData } from "../mockData";

export default function Style10() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#e6e0d6]">
      <header className="border-b border-[#2a2a2f] bg-[#0e0e12]/95 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 lg:px-10">
          <h1 className="text-2xl font-semibold tracking-[0.2em] text-[#d5b67a] uppercase">Heimdall Noir</h1>
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`px-4 py-2 text-xs uppercase tracking-[0.12em] transition-colors border ${
                  activeView === item.id
                    ? "border-[#d5b67a] text-[#d5b67a] bg-[#1a1712]"
                    : "border-transparent text-[#9d988f] hover:text-[#d5b67a] hover:border-[#39342b]"
                }`}
              >
                {item.label}
              </button>
            ))}
            <Link href="/mock" className="ml-2 border border-[#39342b] px-4 py-2 text-xs uppercase tracking-[0.12em] text-[#b4ac9f] hover:text-[#d5b67a] hover:border-[#d5b67a] transition-colors">
              Gallery
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-8 flex items-end justify-between border-b border-[#27272c] pb-4">
          <h2 className="text-3xl font-light tracking-wide text-[#efe9dd]">{navItems.find((item) => item.id === activeView)?.label}</h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[#7f796d]">Elegant Dark Concept</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <article className="border border-[#2d2b27] bg-[#111115] p-6">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#9d988f]">Total Users</p>
                  <p className="mt-4 text-4xl font-light text-[#efe9dd]">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </article>
                <article className="border border-[#2d2b27] bg-[#111115] p-6">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#9d988f]">Active Voice</p>
                  <p className="mt-4 text-4xl font-light text-[#efe9dd]">{mockData.overviewStats.activeVoice}</p>
                </article>
                <article className="border border-[#2d2b27] bg-[#111115] p-6">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#9d988f]">Uptime</p>
                  <p className="mt-4 text-4xl font-light text-[#efe9dd]">{mockData.overviewStats.uptime}</p>
                </article>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="overflow-hidden border border-[#2d2b27] bg-[#111115]">
                <table className="w-full text-left">
                  <thead className="bg-[#16161b] text-[#9d988f]">
                    <tr>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em]">Plugin</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em]">Description</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockData.plugins.map((plugin) => (
                      <tr key={plugin.id} className="border-t border-[#222228] hover:bg-[#17171c]">
                        <td className="px-5 py-4 text-sm text-[#efe9dd]">{plugin.name}</td>
                        <td className="px-5 py-4 text-sm text-[#9d988f]">{plugin.description}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-block border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${plugin.enabled ? "border-[#4a3d20] text-[#d5b67a] bg-[#1a1712]" : "border-[#34343a] text-[#8e8a82] bg-[#151519]"}`}>
                            {plugin.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeView === "analytics" && (
              <div className="border border-[#2d2b27] bg-[#111115] p-6">
                <h3 className="text-sm uppercase tracking-[0.14em] text-[#9d988f]">Message Volume</h3>
                <div className="mt-6 flex h-72 items-end gap-3">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1">
                      <div className="w-full border border-[#3f3420] bg-gradient-to-t from-[#1b160f] to-[#7e6534]" style={{ height: `${(day.count / 25000) * 100}%` }} />
                      <p className="mt-2 text-center text-[10px] uppercase tracking-[0.12em] text-[#8e8a82]">{day.day}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mockData.users.map((user) => (
                  <article key={user.id} className="border border-[#2d2b27] bg-[#111115] p-5">
                    <p className="text-lg font-light text-[#efe9dd]">
                      {user.username}
                      <span className="ml-1 text-sm text-[#9d988f]">#{user.discriminator}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {user.roles.map((role) => (
                        <span key={role} className="border border-[#333139] bg-[#17171c] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#b4ac9f]">
                          {role}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {activeView === "logs" && (
              <div className="space-y-3">
                {mockData.auditLogs.map((log) => (
                  <article key={log.id} className="border border-[#2d2b27] bg-[#111115] p-4">
                    <p className="text-sm text-[#e1dbcf]">
                      <span className="text-[#d5b67a]">{log.actor}</span> performed <span className="text-[#efe9dd]">{log.action}</span> on <span className="text-[#d5b67a]">{log.target}</span>
                    </p>
                    <p className="mt-1 text-xs text-[#8e8a82]">Reason: {log.reason}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[#7f796d]">{log.timestamp}</p>
                  </article>
                ))}
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
}
