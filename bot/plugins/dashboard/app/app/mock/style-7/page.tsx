"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText } from "lucide-react";
import Link from "next/link";

export default function Style7() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "plugins", label: "Plugins", icon: Settings },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "logs", label: "Audit Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#4a4a4a] font-serif overflow-hidden relative">
      {/* Organic Background Shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#fce4ec] rounded-[40%_60%_70%_30%/40%_50%_60%_50%] mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-[#e8f5e9] rounded-[60%_40%_30%_70%/60%_30%_70%_40%] mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[700px] h-[700px] bg-[#e3f2fd] rounded-[30%_70%_70%_30%/30%_30%_70%_70%] mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

      {/* Floating Navigation */}
      <nav className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-white/80 backdrop-blur-md px-8 py-4 rounded-[30px_50px_40px_20px] shadow-[0_10px_40px_rgba(0,0,0,0.05)] border border-white/50 flex items-center space-x-8">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center space-y-1 transition-all duration-300 ${
              activeView === item.id ? "text-[#ff8a65] scale-110" : "text-[#9e9e9e] hover:text-[#ff8a65]"
            }`}
          >
            <item.icon size={24} strokeWidth={1.5} />
            <span className="text-[10px] uppercase tracking-widest font-sans">{item.label}</span>
          </button>
        ))}
        <div className="w-px h-8 bg-[#e0e0e0]"></div>
        <Link href="/mock" className="text-[#9e9e9e] hover:text-[#ff8a65] transition-colors flex flex-col items-center space-y-1">
          <span className="text-[10px] uppercase tracking-widest font-sans">Gallery</span>
        </Link>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 pt-40 pb-20 px-8 max-w-6xl mx-auto">
        <header className="mb-16 text-center">
          <h1 className="text-5xl font-light italic text-[#5d4037] mb-4">
            {navItems.find((i) => i.id === activeView)?.label}
          </h1>
          <p className="text-[#8d6e63] font-sans font-light tracking-wide">A softer approach to server management.</p>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 30, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -30, rotate: 2 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="bg-white/60 backdrop-blur-sm p-10 rounded-[40px_20px_50px_30px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] transition-shadow">
                  <h3 className="text-sm font-sans font-medium text-[#a1887f] uppercase tracking-widest mb-4">Total Users</h3>
                  <p className="text-6xl font-light text-[#5d4037]">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </div>
                <div className="bg-white/60 backdrop-blur-sm p-10 rounded-[20px_50px_30px_40px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] transition-shadow">
                  <h3 className="text-sm font-sans font-medium text-[#a1887f] uppercase tracking-widest mb-4">Active Voice</h3>
                  <p className="text-6xl font-light text-[#5d4037]">{mockData.overviewStats.activeVoice}</p>
                </div>
                <div className="bg-white/60 backdrop-blur-sm p-10 rounded-[50px_30px_40px_20px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] transition-shadow">
                  <h3 className="text-sm font-sans font-medium text-[#a1887f] uppercase tracking-widest mb-4">Uptime</h3>
                  <p className="text-6xl font-light text-[#5d4037]">{mockData.overviewStats.uptime}</p>
                </div>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="bg-white/60 backdrop-blur-sm rounded-[40px_30px_50px_20px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50 overflow-hidden p-8">
                <div className="space-y-6">
                  {mockData.plugins.map((plugin) => (
                    <div key={plugin.id} className="flex items-center justify-between p-6 rounded-[20px_30px_20px_30px] bg-white/40 hover:bg-white/80 transition-colors border border-white/30">
                      <div>
                        <h4 className="font-medium text-2xl text-[#5d4037] mb-1">{plugin.name}</h4>
                        <p className="text-[#8d6e63] font-sans font-light">{plugin.description}</p>
                      </div>
                      <div className={`px-6 py-2 rounded-[20px_10px_20px_10px] font-sans text-sm tracking-widest uppercase ${plugin.enabled ? "bg-[#e8f5e9] text-[#388e3c]" : "bg-[#f5f5f5] text-[#9e9e9e]"}`}>
                        {plugin.enabled ? "Active" : "Resting"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "analytics" && (
              <div className="bg-white/60 backdrop-blur-sm p-12 rounded-[30px_50px_20px_40px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50">
                <h3 className="text-3xl font-light italic text-[#5d4037] mb-10 text-center">Message Flow</h3>
                <div className="h-72 flex items-end space-x-6">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center group">
                      <div className="w-full bg-gradient-to-t from-[#ffccbc] to-[#ffab91] rounded-[20px_20px_10px_10px] relative group-hover:from-[#ffab91] group-hover:to-[#ff8a65] transition-all duration-500" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-[#ff8a65] font-sans text-xs py-2 px-4 rounded-[15px_15px_15px_5px] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                          {day.count}
                        </span>
                      </div>
                      <span className="text-sm font-sans font-medium text-[#a1887f] mt-6 uppercase tracking-widest">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {mockData.users.map((user) => (
                  <div key={user.id} className="bg-white/60 backdrop-blur-sm p-8 rounded-[30px_20px_40px_30px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50 flex items-center space-x-6 hover:bg-white/80 transition-colors">
                    <div className="w-20 h-20 rounded-[40%_60%_70%_30%/40%_50%_60%_50%] bg-[#e3f2fd] flex items-center justify-center text-3xl font-light text-[#1976d2]">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-medium text-2xl text-[#5d4037]">{user.username}<span className="text-[#bcaaa4] font-light text-lg ml-1">#{user.discriminator}</span></h4>
                      <div className="flex space-x-3 mt-3">
                        {user.roles.map(role => (
                          <span key={role} className="text-xs font-sans font-medium text-[#8d6e63] bg-white/50 px-4 py-1.5 rounded-[10px_15px_10px_15px] border border-white/80">{role}</span>
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
                  <div key={log.id} className="bg-white/60 backdrop-blur-sm p-8 rounded-[20px_40px_30px_20px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-white/50 flex justify-between items-center hover:bg-white/80 transition-colors">
                    <div>
                      <p className="text-lg text-[#5d4037]">
                        <span className="font-medium">{log.actor}</span> gently performed <span className="font-medium italic text-[#ff8a65]">{log.action}</span> on <span className="font-medium">{log.target}</span>
                      </p>
                      <p className="text-sm font-sans font-light text-[#a1887f] mt-2">Reason: {log.reason}</p>
                    </div>
                    <span className="text-xs font-sans font-medium text-[#bcaaa4] uppercase tracking-widest">{log.timestamp}</span>
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
