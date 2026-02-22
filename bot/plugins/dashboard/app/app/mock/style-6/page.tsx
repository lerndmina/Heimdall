"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText } from "lucide-react";
import Link from "next/link";

export default function Style6() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#ffcc00] text-black font-mono flex selection:bg-black selection:text-white">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r-8 border-black flex flex-col h-screen sticky top-0">
        <div className="p-6 border-b-8 border-black bg-[#ff3366]">
          <h1 className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">
            HEIMDALL
          </h1>
        </div>
        <nav className="flex-1 p-6 space-y-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center space-x-4 px-4 py-3 border-4 border-black transition-transform active:translate-y-1 active:translate-x-1 active:shadow-none ${
                activeView === item.id
                  ? "bg-[#00ccff] shadow-[4px_4px_0_rgba(0,0,0,1)] translate-y-[-4px] translate-x-[-4px]"
                  : "bg-white hover:bg-gray-100 shadow-[4px_4px_0_rgba(0,0,0,1)] translate-y-[-4px] translate-x-[-4px]"
              }`}
            >
              <item.icon size={24} className="text-black" strokeWidth={3} />
              <span className="font-bold uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-6 border-t-8 border-black bg-[#00ccff]">
          <Link href="/mock" className="w-full flex items-center justify-center px-4 py-3 border-4 border-black bg-white font-bold uppercase tracking-wider shadow-[4px_4px_0_rgba(0,0,0,1)] hover:bg-gray-100 active:translate-y-1 active:translate-x-1 active:shadow-none transition-all">
            BACK TO GALLERY
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10 bg-white border-8 border-black p-6 shadow-[8px_8px_0_rgba(0,0,0,1)] inline-block">
          <h2 className="text-4xl font-black uppercase tracking-tighter">
            {navItems.find((i) => i.id === activeView)?.label}
          </h2>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-[#ff3366] border-8 border-black p-6 shadow-[8px_8px_0_rgba(0,0,0,1)] text-white">
                  <h3 className="text-xl font-bold uppercase tracking-wider mb-4 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">Total Users</h3>
                  <p className="text-5xl font-black drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </div>
                <div className="bg-[#00ccff] border-8 border-black p-6 shadow-[8px_8px_0_rgba(0,0,0,1)] text-white">
                  <h3 className="text-xl font-bold uppercase tracking-wider mb-4 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">Active Voice</h3>
                  <p className="text-5xl font-black drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">{mockData.overviewStats.activeVoice}</p>
                </div>
                <div className="bg-[#00ff66] border-8 border-black p-6 shadow-[8px_8px_0_rgba(0,0,0,1)] text-white">
                  <h3 className="text-xl font-bold uppercase tracking-wider mb-4 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">Uptime</h3>
                  <p className="text-5xl font-black drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">{mockData.overviewStats.uptime}</p>
                </div>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="bg-white border-8 border-black shadow-[8px_8px_0_rgba(0,0,0,1)] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-200 border-b-8 border-black">
                    <tr>
                      <th className="px-6 py-4 text-lg font-bold uppercase tracking-wider border-r-4 border-black">Plugin</th>
                      <th className="px-6 py-4 text-lg font-bold uppercase tracking-wider border-r-4 border-black">Description</th>
                      <th className="px-6 py-4 text-lg font-bold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-4 divide-black">
                    {mockData.plugins.map((plugin) => (
                      <tr key={plugin.id} className="hover:bg-gray-100 transition-colors">
                        <td className="px-6 py-4 font-bold text-xl border-r-4 border-black">{plugin.name}</td>
                        <td className="px-6 py-4 font-medium border-r-4 border-black">{plugin.description}</td>
                        <td className="px-6 py-4">
                          <span className={`px-4 py-2 border-4 border-black font-bold uppercase tracking-wider shadow-[2px_2px_0_rgba(0,0,0,1)] ${plugin.enabled ? "bg-[#00ff66] text-black" : "bg-gray-300 text-black"}`}>
                            {plugin.enabled ? "ON" : "OFF"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeView === "analytics" && (
              <div className="bg-white border-8 border-black p-8 shadow-[8px_8px_0_rgba(0,0,0,1)]">
                <h3 className="text-2xl font-black uppercase tracking-wider mb-8">Message Volume</h3>
                <div className="h-64 flex items-end space-x-4">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center group">
                      <div className="w-full bg-[#ff3366] border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,1)] relative group-hover:bg-[#ff6699] transition-colors" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white border-4 border-black text-black font-bold py-1 px-2 shadow-[2px_2px_0_rgba(0,0,0,1)] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          {day.count}
                        </span>
                      </div>
                      <span className="text-lg font-bold uppercase mt-4">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {mockData.users.map((user) => (
                  <div key={user.id} className="bg-white border-8 border-black p-6 shadow-[8px_8px_0_rgba(0,0,0,1)] flex items-center space-x-6 hover:bg-gray-50 transition-colors">
                    <div className="w-16 h-16 bg-[#00ccff] border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,1)] flex items-center justify-center text-3xl font-black text-white drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-black text-2xl uppercase">{user.username}<span className="text-gray-500 text-lg">#{user.discriminator}</span></h4>
                      <div className="flex space-x-2 mt-2">
                        {user.roles.map(role => (
                          <span key={role} className="text-sm font-bold uppercase bg-[#ffcc00] border-2 border-black px-2 py-1 shadow-[2px_2px_0_rgba(0,0,0,1)]">{role}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === "logs" && (
              <div className="space-y-6">
                {mockData.auditLogs.map((log) => (
                  <div key={log.id} className="bg-white border-8 border-black p-6 shadow-[8px_8px_0_rgba(0,0,0,1)] flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-lg font-medium">
                        <span className="font-black">{log.actor}</span> did <span className="font-black text-[#ff3366]">{log.action}</span> to <span className="font-black">{log.target}</span>
                      </p>
                      <p className="text-sm font-bold text-gray-600 mt-2 uppercase">Reason: {log.reason}</p>
                    </div>
                    <span className="text-sm font-bold bg-black text-white px-3 py-2 border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,0.2)]">{log.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
