"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText } from "lucide-react";
import Link from "next/link";

export default function Style4() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#e0e5ec] text-gray-700 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 p-8 flex flex-col h-screen sticky top-0">
        <div className="mb-12 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#e0e5ec] shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)] flex items-center justify-center">
            <span className="font-bold text-xl text-gray-600">H</span>
          </div>
        </div>
        <nav className="flex-1 space-y-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all duration-300 ${
                activeView === item.id
                  ? "bg-[#e0e5ec] shadow-[inset_6px_6px_10px_0_rgba(163,177,198,0.7),inset_-6px_-6px_10px_0_rgba(255,255,255,0.8)] text-blue-500 font-medium"
                  : "bg-[#e0e5ec] shadow-[6px_6px_10px_0_rgba(163,177,198,0.7),-6px_-6px_10px_0_rgba(255,255,255,0.8)] hover:shadow-[inset_2px_2px_5px_0_rgba(163,177,198,0.5),inset_-2px_-2px_5px_0_rgba(255,255,255,0.5)] text-gray-500"
              }`}
            >
              <item.icon size={20} className={activeView === item.id ? "text-blue-500" : "text-gray-400"} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <Link href="/mock" className="w-full flex items-center justify-center px-6 py-4 rounded-2xl bg-[#e0e5ec] shadow-[6px_6px_10px_0_rgba(163,177,198,0.7),-6px_-6px_10px_0_rgba(255,255,255,0.8)] hover:shadow-[inset_2px_2px_5px_0_rgba(163,177,198,0.5),inset_-2px_-2px_5px_0_rgba(255,255,255,0.5)] text-gray-500 transition-all duration-300">
            Back to Gallery
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-gray-700 tracking-tight">
            {navItems.find((i) => i.id === activeView)?.label}
          </h1>
          <p className="text-gray-500 mt-2">Neumorphic Dashboard Design</p>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="bg-[#e0e5ec] p-8 rounded-3xl shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-[#e0e5ec] shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] flex items-center justify-center mb-6">
                    <Users size={24} className="text-blue-500" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Total Users</h3>
                  <p className="text-4xl font-bold text-gray-700">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </div>
                <div className="bg-[#e0e5ec] p-8 rounded-3xl shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-[#e0e5ec] shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] flex items-center justify-center mb-6">
                    <BarChart3 size={24} className="text-green-500" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Active Voice</h3>
                  <p className="text-4xl font-bold text-gray-700">{mockData.overviewStats.activeVoice}</p>
                </div>
                <div className="bg-[#e0e5ec] p-8 rounded-3xl shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-[#e0e5ec] shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] flex items-center justify-center mb-6">
                    <Settings size={24} className="text-purple-500" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Uptime</h3>
                  <p className="text-4xl font-bold text-gray-700">{mockData.overviewStats.uptime}</p>
                </div>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="bg-[#e0e5ec] p-8 rounded-3xl shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)]">
                <div className="space-y-6">
                  {mockData.plugins.map((plugin) => (
                    <div key={plugin.id} className="flex items-center justify-between p-6 rounded-2xl bg-[#e0e5ec] shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]">
                      <div>
                        <h4 className="font-bold text-gray-700 text-lg">{plugin.name}</h4>
                        <p className="text-gray-500 mt-1">{plugin.description}</p>
                      </div>
                      <div className={`w-16 h-8 rounded-full p-1 flex items-center cursor-pointer transition-colors duration-300 ${plugin.enabled ? "bg-blue-400 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]" : "bg-[#e0e5ec] shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]"}`}>
                        <div className={`w-6 h-6 rounded-full bg-[#e0e5ec] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] transform transition-transform duration-300 ${plugin.enabled ? "translate-x-8" : "translate-x-0"}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "analytics" && (
              <div className="bg-[#e0e5ec] p-10 rounded-3xl shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)]">
                <h3 className="text-xl font-bold text-gray-700 mb-10">Message Volume</h3>
                <div className="h-64 flex items-end space-x-6">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-[#e0e5ec] rounded-t-xl shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] relative overflow-hidden" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        <div className="absolute bottom-0 left-0 w-full bg-blue-400 opacity-80" style={{ height: '100%' }}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-500 mt-4">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {mockData.users.map((user) => (
                  <div key={user.id} className="bg-[#e0e5ec] p-6 rounded-3xl shadow-[9px_9px_16px_rgb(163,177,198),-9px_-9px_16px_rgba(255,255,255,0.5)] flex items-center space-x-6">
                    <div className="w-16 h-16 rounded-full bg-[#e0e5ec] shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] flex items-center justify-center text-xl font-bold text-gray-600">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-700 text-lg">{user.username}<span className="text-gray-400 font-normal">#{user.discriminator}</span></h4>
                      <div className="flex space-x-3 mt-3">
                        {user.roles.map(role => (
                          <span key={role} className="text-xs font-medium text-gray-500 bg-[#e0e5ec] shadow-[3px_3px_6px_rgb(163,177,198),-3px_-3px_6px_rgba(255,255,255,0.5)] px-3 py-1.5 rounded-full">{role}</span>
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
                  <div key={log.id} className="bg-[#e0e5ec] p-6 rounded-2xl shadow-[inset_4px_4px_8px_rgb(163,177,198),inset_-4px_-4px_8px_rgba(255,255,255,0.5)] flex justify-between items-center">
                    <div>
                      <p className="text-gray-700">
                        <span className="font-bold">{log.actor}</span> performed <span className="font-bold text-blue-500">{log.action}</span> on <span className="font-bold">{log.target}</span>
                      </p>
                      <p className="text-sm text-gray-500 mt-2">Reason: {log.reason}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-400 bg-[#e0e5ec] shadow-[3px_3px_6px_rgb(163,177,198),-3px_-3px_6px_rgba(255,255,255,0.5)] px-4 py-2 rounded-full">{log.timestamp}</span>
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
