"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { BarChart3, LayoutDashboard, ScrollText, Settings, Users } from "lucide-react";
import { mockData } from "../mockData";

export default function Style9() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "OVERVIEW", icon: LayoutDashboard },
    { id: "plugins", label: "PLUGINS", icon: Settings },
    { id: "analytics", label: "ANALYTICS", icon: BarChart3 },
    { id: "users", label: "USERS", icon: Users },
    { id: "logs", label: "AUDIT LOGS", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#fdfdfd] text-black font-sans">
      <header className="sticky top-0 z-40 border-b-8 border-black bg-[#ffef00]">
        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-4xl font-black tracking-tight lg:text-6xl">HEIMDALL BRUTAL</h1>
            <Link href="/mock" className="border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase hover:bg-black hover:text-white transition-colors">
              Back to Gallery
            </Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`border-4 border-black px-4 py-2 text-xs font-black uppercase tracking-wide lg:text-sm ${
                  activeView === item.id ? "bg-black text-white" : "bg-white hover:bg-black hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
        <div className="mb-6 border-4 border-black bg-white px-5 py-3 text-xl font-black uppercase lg:text-3xl">
          {navItems.find((item) => item.id === activeView)?.label}
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={activeView}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.16 }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <article className="border-4 border-black bg-[#ffef00] p-6">
                  <p className="text-xs font-black uppercase">Total Users</p>
                  <p className="mt-3 text-5xl font-black">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </article>
                <article className="border-4 border-black bg-white p-6">
                  <p className="text-xs font-black uppercase">Active Voice</p>
                  <p className="mt-3 text-5xl font-black">{mockData.overviewStats.activeVoice}</p>
                </article>
                <article className="border-4 border-black bg-black p-6 text-white">
                  <p className="text-xs font-black uppercase">Uptime</p>
                  <p className="mt-3 text-5xl font-black">{mockData.overviewStats.uptime}</p>
                </article>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="overflow-hidden border-4 border-black bg-white">
                <table className="w-full text-left">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black uppercase">Plugin</th>
                      <th className="px-4 py-3 text-xs font-black uppercase">Description</th>
                      <th className="px-4 py-3 text-xs font-black uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockData.plugins.map((plugin, index) => (
                      <tr key={plugin.id} className={index % 2 === 0 ? "bg-[#f7f7f7]" : "bg-white"}>
                        <td className="border-t-4 border-black px-4 py-3 text-sm font-black uppercase">{plugin.name}</td>
                        <td className="border-t-4 border-black px-4 py-3 text-sm">{plugin.description}</td>
                        <td className="border-t-4 border-black px-4 py-3">
                          <span className={`inline-block border-2 border-black px-2 py-1 text-xs font-black uppercase ${plugin.enabled ? "bg-[#9cff57]" : "bg-[#ff6b6b]"}`}>
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
              <div className="border-4 border-black bg-white p-6">
                <h3 className="text-lg font-black uppercase">Message Volume</h3>
                <div className="mt-6 flex h-72 items-end gap-2">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1">
                      <div className="w-full border-2 border-black bg-[#ffef00]" style={{ height: `${(day.count / 25000) * 100}%` }} />
                      <p className="mt-2 text-center text-xs font-black uppercase">{day.day}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mockData.users.map((user, index) => (
                  <article key={user.id} className={`border-4 border-black p-5 ${index % 2 === 0 ? "bg-white" : "bg-[#ffef00]"}`}>
                    <p className="text-lg font-black uppercase">
                      {user.username}
                      <span className="ml-1 text-sm">#{user.discriminator}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {user.roles.map((role) => (
                        <span key={role} className="border-2 border-black bg-black px-2 py-1 text-[10px] font-black uppercase text-white">
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
                  <article key={log.id} className="border-4 border-black bg-white p-4">
                    <p className="text-sm">
                      <span className="font-black uppercase">{log.actor}</span> performed <span className="font-black uppercase">{log.action}</span> on <span className="font-black uppercase">{log.target}</span>
                    </p>
                    <p className="mt-1 text-xs uppercase">Reason: {log.reason}</p>
                    <p className="mt-2 inline-block border-2 border-black bg-[#ffef00] px-2 py-1 text-[10px] font-black uppercase">{log.timestamp}</p>
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
