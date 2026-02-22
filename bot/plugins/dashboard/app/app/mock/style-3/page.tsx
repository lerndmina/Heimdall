"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mockData } from "../mockData";
import { LayoutDashboard, Settings, BarChart3, Users, ScrollText, Terminal } from "lucide-react";
import Link from "next/link";

export default function Style3() {
  const [activeView, setActiveView] = useState("overview");

  const navItems = [
    { id: "overview", label: "SYS.OVERVIEW", icon: LayoutDashboard },
    { id: "plugins", label: "MOD.CONFIG", icon: Settings },
    { id: "analytics", label: "DATA.STREAM", icon: BarChart3 },
    { id: "users", label: "USR.MATRIX", icon: Users },
    { id: "logs", label: "AUDIT.LOG", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-black text-cyan-400 font-mono overflow-hidden relative selection:bg-pink-500 selection:text-black">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00ffff11_1px,transparent_1px),linear-gradient(to_bottom,#00ffff11_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none"></div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 border-b-2 border-pink-500 bg-black/80 backdrop-blur-sm flex items-center justify-between px-6 py-4 shadow-[0_0_15px_rgba(236,72,153,0.5)]">
        <div className="flex items-center space-x-4">
          <Terminal className="text-pink-500 animate-pulse" size={28} />
          <h1 className="text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 uppercase">
            HEIMDALL_OS
          </h1>
        </div>
        <nav className="hidden md:flex space-x-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`px-4 py-2 text-sm font-bold tracking-widest uppercase transition-all duration-200 border-b-2 ${
                activeView === item.id
                  ? "border-cyan-400 text-cyan-400 bg-cyan-900/20 shadow-[inset_0_-5px_10px_rgba(34,211,238,0.2)]"
                  : "border-transparent text-gray-500 hover:text-pink-400 hover:border-pink-400"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <Link href="/mock" className="px-4 py-2 border border-cyan-400 text-cyan-400 text-xs font-bold uppercase tracking-widest hover:bg-cyan-400 hover:text-black transition-colors shadow-[0_0_10px_rgba(34,211,238,0.3)]">
          EXIT_SYS
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 p-8 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center space-x-4">
          <div className="h-px flex-1 bg-gradient-to-r from-pink-500 to-transparent"></div>
          <h2 className="text-xl font-bold tracking-widest text-pink-500 uppercase animate-pulse">
            {navItems.find((i) => i.id === activeView)?.label} // ACTIVE
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-cyan-400 to-transparent"></div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, x: -20, filter: "hue-rotate(90deg)" }}
            animate={{ opacity: 1, x: 0, filter: "hue-rotate(0deg)" }}
            exit={{ opacity: 0, x: 20, filter: "hue-rotate(-90deg)" }}
            transition={{ duration: 0.3, type: "tween" }}
          >
            {activeView === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-black border border-cyan-500/50 p-6 relative group overflow-hidden shadow-[0_0_15px_rgba(34,211,238,0.1)] hover:shadow-[0_0_25px_rgba(34,211,238,0.3)] transition-shadow">
                  <div className="absolute top-0 left-0 w-2 h-full bg-cyan-400"></div>
                  <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-colors"></div>
                  <h3 className="text-xs font-bold text-cyan-600 tracking-widest mb-2">TOTAL_ENTITIES</h3>
                  <p className="text-5xl font-black text-white tracking-tighter">{mockData.overviewStats.totalUsers.toLocaleString()}</p>
                </div>
                <div className="bg-black border border-pink-500/50 p-6 relative group overflow-hidden shadow-[0_0_15px_rgba(236,72,153,0.1)] hover:shadow-[0_0_25px_rgba(236,72,153,0.3)] transition-shadow">
                  <div className="absolute top-0 left-0 w-2 h-full bg-pink-500"></div>
                  <div className="absolute -right-10 -top-10 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl group-hover:bg-pink-500/20 transition-colors"></div>
                  <h3 className="text-xs font-bold text-pink-700 tracking-widest mb-2">ACTIVE_VOICE_NODES</h3>
                  <p className="text-5xl font-black text-white tracking-tighter">{mockData.overviewStats.activeVoice}</p>
                </div>
                <div className="bg-black border border-yellow-500/50 p-6 relative group overflow-hidden shadow-[0_0_15px_rgba(234,179,8,0.1)] hover:shadow-[0_0_25px_rgba(234,179,8,0.3)] transition-shadow">
                  <div className="absolute top-0 left-0 w-2 h-full bg-yellow-500"></div>
                  <div className="absolute -right-10 -top-10 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl group-hover:bg-yellow-500/20 transition-colors"></div>
                  <h3 className="text-xs font-bold text-yellow-700 tracking-widest mb-2">SYS_UPTIME</h3>
                  <p className="text-5xl font-black text-white tracking-tighter">{mockData.overviewStats.uptime}</p>
                </div>
              </div>
            )}

            {activeView === "plugins" && (
              <div className="border border-cyan-500/30 bg-black/50 backdrop-blur-sm shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-cyan-950/30 border-b border-cyan-500/50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-cyan-400 tracking-widest uppercase">Module_ID</th>
                      <th className="px-6 py-4 text-xs font-bold text-cyan-400 tracking-widest uppercase">Function_Desc</th>
                      <th className="px-6 py-4 text-xs font-bold text-cyan-400 tracking-widest uppercase">Power_State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-900/30">
                    {mockData.plugins.map((plugin) => (
                      <tr key={plugin.id} className="hover:bg-cyan-900/20 transition-colors group">
                        <td className="px-6 py-4 font-bold text-white group-hover:text-cyan-300 transition-colors">{plugin.name}</td>
                        <td className="px-6 py-4 text-gray-400">{plugin.description}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 text-xs font-bold tracking-widest uppercase border ${plugin.enabled ? "bg-green-900/30 text-green-400 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" : "bg-red-900/30 text-red-400 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"}`}>
                            {plugin.enabled ? "ONLINE" : "OFFLINE"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeView === "analytics" && (
              <div className="border border-pink-500/30 bg-black/50 backdrop-blur-sm p-8 shadow-[0_0_20px_rgba(236,72,153,0.1)] relative">
                <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-pink-500"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-pink-500"></div>
                
                <h3 className="text-lg font-bold text-pink-500 tracking-widest mb-8 uppercase">Data_Stream_Analysis</h3>
                <div className="h-64 flex items-end space-x-2">
                  {mockData.analytics.messageVolume.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center group">
                      <div className="w-full bg-pink-900/40 border border-pink-500/50 relative group-hover:bg-pink-500/60 transition-all duration-300" style={{ height: `${(day.count / 25000) * 100}%` }}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-pink-400 shadow-[0_0_10px_rgba(236,72,153,1)]"></div>
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black border border-pink-500 text-pink-400 text-xs py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity font-bold tracking-widest">
                          {day.count}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 mt-3 font-bold tracking-widest uppercase">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === "users" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mockData.users.map((user) => (
                  <div key={user.id} className="bg-black border border-cyan-900 p-6 flex items-center space-x-4 hover:border-cyan-400 transition-colors relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-12 h-12 bg-cyan-950 border border-cyan-500 flex items-center justify-center text-cyan-400 font-bold text-xl shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                      {user.username.charAt(0)}
                    </div>
                    <div className="relative z-10">
                      <h4 className="font-bold text-white tracking-wider">{user.username}<span className="text-cyan-600">#{user.discriminator}</span></h4>
                      <div className="flex space-x-2 mt-2">
                        {user.roles.map(role => (
                          <span key={role} className="text-[10px] font-bold tracking-widest uppercase bg-black border border-cyan-700 text-cyan-500 px-2 py-0.5">{role}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === "logs" && (
              <div className="space-y-3">
                {mockData.auditLogs.map((log) => (
                  <div key={log.id} className="bg-black border-l-4 border-yellow-500 p-4 flex justify-between items-center hover:bg-yellow-900/10 transition-colors">
                    <div>
                      <p className="text-sm text-gray-300 font-mono">
                        <span className="font-bold text-white">{log.actor}</span> &gt; <span className="font-bold text-yellow-400">{log.action}</span> &gt; <span className="font-bold text-white">{log.target}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1 tracking-widest uppercase">Rsn: {log.reason}</p>
                    </div>
                    <span className="text-xs text-yellow-600 font-bold tracking-widest border border-yellow-900 px-2 py-1">{log.timestamp}</span>
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
