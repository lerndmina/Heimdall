"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText, Plus, Menu } from "lucide-react";
import Link from "next/link";

export default function Style5() {
  const [activeView, setActiveView] = useState("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 font-roboto relative">
      {/* Top App Bar */}
      <header className="bg-[#6200ee] text-white shadow-md h-16 flex items-center px-4 sticky top-0 z-30">
        <button onClick={() => setDrawerOpen(!drawerOpen)} className="p-3 rounded-full hover:bg-white/10 transition-colors mr-4">
          <Menu size={24} />
        </button>
        <h1 className="text-xl font-medium tracking-wide">Heimdall Dashboard</h1>
        <div className="ml-auto">
          <Link href="/mock" className="text-sm font-medium uppercase tracking-wider hover:bg-white/10 px-4 py-2 rounded transition-colors">
            Gallery
          </Link>
        </div>
      </header>

      {/* Navigation Drawer (Overlay) */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="h-32 bg-[#6200ee] p-4 flex items-end">
                <h2 className="text-white text-2xl font-medium">Menu</h2>
              </div>
              <nav className="flex-1 py-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveView(item.id);
                      setDrawerOpen(false);
                    }}
                    className={`w-full flex items-center space-x-6 px-6 py-3 transition-colors ${
                      activeView === item.id ? "bg-[#6200ee]/10 text-[#6200ee]" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon size={24} className={activeView === item.id ? "text-[#6200ee]" : "text-gray-500"} />
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded shadow-md border-t-4 border-[#03dac6]">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Total Users</h3>
                  <p className="text-4xl font-normal text-gray-900">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded shadow-md border-t-4 border-[#bb86fc]">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Active Voice</h3>
                  <p className="text-4xl font-normal text-gray-900">{mockData.overviewStats.activeVoice}</p>
                </div>
                <div className="bg-white p-6 rounded shadow-md border-t-4 border-[#cf6679]">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Uptime</h3>
                  <p className="text-4xl font-normal text-gray-900">{mockData.overviewStats.uptime}</p>
                </div>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="bg-white rounded shadow-md overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-sm font-medium text-gray-600">Plugin</th>
                      <th className="px-6 py-4 text-sm font-medium text-gray-600">Description</th>
                      <th className="px-6 py-4 text-sm font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mockData.plugins.map((plugin) => (
                      <tr key={plugin.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{plugin.name}</td>
                        <td className="px-6 py-4 text-gray-600">{plugin.description}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${plugin.enabled ? "bg-[#03dac6]/20 text-[#018786]" : "bg-gray-200 text-gray-600"}`}>
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
              <div className="bg-white p-6 rounded shadow-md">
                <h3 className="text-xl font-medium text-gray-900 mb-6">Message Volume</h3>
                <div className="h-64 flex items-end space-x-4">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-[#6200ee] rounded-t shadow-sm hover:bg-[#3700b3] transition-colors relative group" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          {day.count}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-600 mt-2">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mockData.users.map((user) => (
                  <div key={user.id} className="bg-white p-4 rounded shadow-md flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full bg-[#bb86fc] flex items-center justify-center text-white font-medium text-xl">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 text-lg">{user.username}<span className="text-gray-500 text-sm">#{user.discriminator}</span></h4>
                      <div className="flex space-x-2 mt-1">
                        {user.roles.map(role => (
                          <span key={role} className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-1 rounded">{role}</span>
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
                  <div key={log.id} className="bg-white p-4 rounded shadow-md flex justify-between items-center border-l-4 border-[#03dac6]">
                    <div>
                      <p className="text-gray-900">
                        <span className="font-medium">{log.actor}</span> performed <span className="font-medium text-[#6200ee]">{log.action}</span> on <span className="font-medium">{log.target}</span>
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Reason: {log.reason}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500">{log.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button */}
      <button className="fixed bottom-8 right-8 w-14 h-14 bg-[#03dac6] text-black rounded-full shadow-lg flex items-center justify-center hover:bg-[#018786] hover:text-white transition-colors z-30">
        <Plus size={24} />
      </button>
    </div>
  );
}
