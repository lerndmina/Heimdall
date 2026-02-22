"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText, Menu, X } from "lucide-react";
import Link from "next/link";

export default function Style1() {
  const [activeView, setActiveView] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 256 : 80 }}
        className="bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 overflow-hidden"
      >
        <div className="p-6 flex items-center justify-between border-b border-gray-100">
          {sidebarOpen && <span className="font-bold text-xl tracking-tight">Heimdall</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                activeView === item.id ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <item.icon size={20} className={activeView === item.id ? "text-blue-600" : "text-gray-400"} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <Link href="/mock" className="text-sm text-gray-500 hover:text-gray-800 flex items-center justify-center">
            ← Back to Gallery
          </Link>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-light text-gray-800 capitalize tracking-wide">
            {navItems.find((i) => i.id === activeView)?.label}
          </h1>
          <p className="text-gray-500 mt-2 font-light">Manage your server settings and view analytics.</p>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Total Users</h3>
                  <p className="text-4xl font-light text-gray-900">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Active Voice</h3>
                  <p className="text-4xl font-light text-gray-900">{mockData.overviewStats.activeVoice}</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Uptime</h3>
                  <p className="text-4xl font-light text-gray-900">{mockData.overviewStats.uptime}</p>
                </div>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Plugin</th>
                      <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mockData.plugins.map((plugin) => (
                      <tr key={plugin.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{plugin.name}</td>
                        <td className="px-6 py-4 text-gray-500">{plugin.description}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${plugin.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
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
              <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-medium text-gray-800 mb-6">Message Volume (Last 7 Days)</h3>
                <div className="h-64 flex items-end space-x-2">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center group">
                      <div className="w-full bg-blue-100 rounded-t-md relative group-hover:bg-blue-200 transition-colors" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          {day.count}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 mt-2">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mockData.users.map((user) => (
                  <div key={user.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-medium">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{user.username}#{user.discriminator}</h4>
                      <div className="flex space-x-2 mt-1">
                        {user.roles.map(role => (
                          <span key={role} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{role}</span>
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
                  <div key={log.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{log.actor}</span> performed <span className="font-medium text-blue-600">{log.action}</span> on <span className="font-medium">{log.target}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Reason: {log.reason}</p>
                    </div>
                    <span className="text-xs text-gray-400">{log.timestamp}</span>
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
