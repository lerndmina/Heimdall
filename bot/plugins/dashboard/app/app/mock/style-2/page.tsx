"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText } from "lucide-react";
import Link from "next/link";

export default function Style2() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-fuchsia-900 text-white font-sans overflow-hidden relative">
      {/* Animated Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      {/* Main Content Area */}
      <main className="relative z-10 h-screen flex flex-col items-center p-8 pb-32 overflow-y-auto">
        <header className="w-full max-w-5xl mb-12 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              {navItems.find((i) => i.id === activeView)?.label}
            </h1>
            <p className="text-white/60 mt-2">Glassmorphism Dashboard</p>
          </div>
          <Link href="/mock" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 transition-all text-sm">
            Back to Gallery
          </Link>
        </header>

        <div className="w-full max-w-5xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {activeView === "overview" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 shadow-2xl">
                    <h3 className="text-white/60 font-medium mb-2">Total Users</h3>
                    <p className="text-5xl font-bold">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 shadow-2xl">
                    <h3 className="text-white/60 font-medium mb-2">Active Voice</h3>
                    <p className="text-5xl font-bold">{mockData.overviewStats.activeVoice}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 shadow-2xl">
                    <h3 className="text-white/60 font-medium mb-2">Uptime</h3>
                    <p className="text-5xl font-bold">{mockData.overviewStats.uptime}</p>
                  </div>
                </div>
              )}

              {activeView === "plugins" && (
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="px-6 py-5 text-sm font-medium text-white/60">Plugin</th>
                        <th className="px-6 py-5 text-sm font-medium text-white/60">Description</th>
                        <th className="px-6 py-5 text-sm font-medium text-white/60">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {mockData.plugins.map((plugin) => (
                        <tr key={plugin.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-5 font-medium">{plugin.name}</td>
                          <td className="px-6 py-5 text-white/70">{plugin.description}</td>
                          <td className="px-6 py-5">
                            <span className={`px-4 py-1.5 rounded-full text-xs font-medium backdrop-blur-md ${plugin.enabled ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-white/10 text-white/60 border border-white/10"}`}>
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
                <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 shadow-2xl">
                  <h3 className="text-xl font-medium mb-8">Message Volume</h3>
                  <div className="h-64 flex items-end space-x-4">
                    {mockData.analytics.messageVolume.map((day) => (
                      <div key={day.day} className="flex-1 flex flex-col items-center group">
                        <div className="w-full bg-gradient-to-t from-white/5 to-white/40 rounded-t-xl relative group-hover:to-white/60 transition-all duration-300" style={{ height: `${(day.count / 25000) * 100}%` }}>
                          <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white/20 backdrop-blur-md text-white text-sm py-1 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity border border-white/20">
                            {day.count}
                          </span>
                        </div>
                        <span className="text-sm text-white/60 mt-4">{day.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeView === "users" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {mockData.users.map((user) => (
                    <div key={user.id} className="bg-white/10 backdrop-blur-xl p-6 rounded-3xl border border-white/20 shadow-2xl flex items-center space-x-5 hover:bg-white/15 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-xl font-bold shadow-inner">
                        {user.username.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-medium text-lg">{user.username}<span className="text-white/50">#{user.discriminator}</span></h4>
                        <div className="flex space-x-2 mt-2">
                          {user.roles.map(role => (
                            <span key={role} className="text-xs bg-white/10 border border-white/10 px-3 py-1 rounded-full">{role}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeView === "logs" && (
                <div className="space-y-4">
                  {mockData.auditLogs.map((log) => (
                    <div key={log.id} className="bg-white/10 backdrop-blur-xl p-5 rounded-2xl border border-white/20 shadow-lg flex justify-between items-center hover:bg-white/15 transition-colors">
                      <div>
                        <p className="text-white/90">
                          <span className="font-bold text-white">{log.actor}</span> performed <span className="font-bold text-pink-400">{log.action}</span> on <span className="font-bold text-white">{log.target}</span>
                        </p>
                        <p className="text-sm text-white/50 mt-1">Reason: {log.reason}</p>
                      </div>
                      <span className="text-sm text-white/40 bg-white/5 px-3 py-1 rounded-full">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Dock Navigation */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <nav className="flex items-center space-x-2 bg-white/10 backdrop-blur-2xl p-2 rounded-full border border-white/20 shadow-2xl">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`relative p-4 rounded-full flex items-center justify-center transition-all duration-300 group ${
                activeView === item.id ? "text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              {activeView === item.id && (
                <motion.div
                  layoutId="dock-active"
                  className="absolute inset-0 bg-white/20 rounded-full"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <item.icon size={24} className="relative z-10" />
              
              {/* Tooltip */}
              <span className="absolute -top-12 bg-white/20 backdrop-blur-md text-white text-sm px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
