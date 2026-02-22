"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText, X, Minus, Square } from "lucide-react";
import Link from "next/link";

export default function Style8() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#008080] text-black font-sans flex flex-col overflow-hidden selection:bg-[#000080] selection:text-white">
      {/* Main Desktop Area */}
      <main className="flex-1 p-8 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-8 bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] shadow-[2px_2px_0_#000] flex flex-col"
          >
            {/* Window Title Bar */}
            <div className="bg-[#000080] text-white px-2 py-1 flex justify-between items-center font-bold text-sm">
              <div className="flex items-center space-x-2">
                <LayoutDashboard size={16} />
                <span>Heimdall_Dashboard - {navItems.find((i) => i.id === activeView)?.label}.exe</span>
              </div>
              <div className="flex space-x-1">
                <button className="bg-[#c0c0c0] text-black border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] p-0.5 active:border-t-[#808080] active:border-l-[#808080] active:border-b-white active:border-r-white">
                  <Minus size={14} />
                </button>
                <button className="bg-[#c0c0c0] text-black border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] p-0.5 active:border-t-[#808080] active:border-l-[#808080] active:border-b-white active:border-r-white">
                  <Square size={14} />
                </button>
                <button className="bg-[#c0c0c0] text-black border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] p-0.5 active:border-t-[#808080] active:border-l-[#808080] active:border-b-white active:border-r-white">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Window Menu Bar */}
            <div className="flex space-x-4 px-2 py-1 border-b border-[#808080] text-sm">
              <span className="hover:bg-[#000080] hover:text-white px-1 cursor-default"><span className="underline">F</span>ile</span>
              <span className="hover:bg-[#000080] hover:text-white px-1 cursor-default"><span className="underline">E</span>dit</span>
              <span className="hover:bg-[#000080] hover:text-white px-1 cursor-default"><span className="underline">V</span>iew</span>
              <span className="hover:bg-[#000080] hover:text-white px-1 cursor-default"><span className="underline">H</span>elp</span>
            </div>

            {/* Window Content */}
            <div className="flex-1 p-4 overflow-y-auto bg-white border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white m-2">
              {activeView === "overview" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#c0c0c0] p-4 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080]">
                    <h3 className="text-sm font-bold mb-2">Total Users</h3>
                    <p className="text-3xl font-serif">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                  </div>
                  <div className="bg-[#c0c0c0] p-4 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080]">
                    <h3 className="text-sm font-bold mb-2">Active Voice</h3>
                    <p className="text-3xl font-serif">{mockData.overviewStats.activeVoice}</p>
                  </div>
                  <div className="bg-[#c0c0c0] p-4 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080]">
                    <h3 className="text-sm font-bold mb-2">Uptime</h3>
                    <p className="text-3xl font-serif">{mockData.overviewStats.uptime}</p>
                  </div>
                </div>
              )}

              {activeView === "plugins" && (
                <div className="border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#c0c0c0]">
                      <tr>
                        <th className="px-4 py-2 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] font-normal">Plugin Name</th>
                        <th className="px-4 py-2 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] font-normal">Description</th>
                        <th className="px-4 py-2 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] font-normal">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockData.plugins.map((plugin) => (
                        <tr key={plugin.id} className="hover:bg-[#000080] hover:text-white cursor-default">
                          <td className="px-4 py-2 border-r border-b border-[#c0c0c0]">{plugin.name}</td>
                          <td className="px-4 py-2 border-r border-b border-[#c0c0c0]">{plugin.description}</td>
                          <td className="px-4 py-2 border-b border-[#c0c0c0]">
                            {plugin.enabled ? "Enabled" : "Disabled"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeView === "analytics" && (
                <div className="bg-[#c0c0c0] p-6 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080]">
                  <h3 className="text-lg font-bold mb-6">Message Volume.bmp</h3>
                  <div className="h-64 flex items-end space-x-2 bg-white border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white p-2">
                    {mockData.analytics.messageVolume.map((day) => (
                      <div key={day.day} className="flex-1 flex flex-col items-center">
                        <div className="w-full bg-[#000080] border border-black relative" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        </div>
                        <span className="text-xs mt-2">{day.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeView === "users" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mockData.users.map((user) => (
                    <div key={user.id} className="bg-[#c0c0c0] p-4 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] flex items-center space-x-4">
                      <div className="w-12 h-12 bg-white border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white flex items-center justify-center text-xl font-bold text-[#000080]">
                        {user.username.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{user.username}<span className="text-gray-600 text-sm font-normal">#{user.discriminator}</span></h4>
                        <div className="flex space-x-2 mt-1">
                          {user.roles.map(role => (
                            <span key={role} className="text-xs bg-white border border-[#808080] px-1">{role}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeView === "logs" && (
                <div className="space-y-2">
                  {mockData.auditLogs.map((log) => (
                    <div key={log.id} className="bg-[#c0c0c0] p-2 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] flex justify-between items-center text-sm">
                      <div>
                        <p>
                          <span className="font-bold">{log.actor}</span> performed <span className="font-bold text-[#000080]">{log.action}</span> on <span className="font-bold">{log.target}</span>
                        </p>
                        <p className="text-xs text-gray-700 mt-1">Reason: {log.reason}</p>
                      </div>
                      <span className="text-xs bg-white border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white px-2 py-1">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Taskbar */}
      <footer className="bg-[#c0c0c0] border-t-2 border-white p-1 flex items-center space-x-2 z-50">
        <Link href="/mock" className="flex items-center space-x-2 px-2 py-1 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] font-bold active:border-t-[#808080] active:border-l-[#808080] active:border-b-white active:border-r-white">
          <span className="text-blue-800 italic font-serif text-lg leading-none">H</span>
          <span>Start</span>
        </Link>
        <div className="w-px h-6 bg-[#808080] border-r border-white mx-1"></div>
        
        <div className="flex-1 flex space-x-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex items-center space-x-2 px-3 py-1 text-sm font-bold min-w-[120px] truncate ${
                activeView === item.id
                  ? "border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white bg-[#e0e0e0] shadow-[inset_1px_1px_0_#000]"
                  : "border-t-2 border-l-2 border-white border-b-2 border-r-2 border-[#808080] active:border-t-[#808080] active:border-l-[#808080] active:border-b-white active:border-r-white"
              }`}
            >
              <item.icon size={14} className={activeView === item.id ? "text-[#000080]" : "text-black"} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="px-3 py-1 border-t-2 border-l-2 border-[#808080] border-b-2 border-r-2 border-white text-xs flex items-center space-x-2">
          <Settings size={14} />
          <span>4:20 PM</span>
        </div>
      </footer>
    </div>
  );
}
