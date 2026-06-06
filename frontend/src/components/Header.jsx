import React from 'react';

export default function Header({ user, dbStatus, handleLogout }) {
  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050505]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-3.5 h-3.5 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white hidden sm:block">
            Magnus<span className="text-cyan-400">CI</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] px-3 py-1 rounded-full text-xs font-medium">
            <span className="relative flex h-2 w-2">
              {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus === "connected" ? "bg-emerald-500" : "bg-rose-500"}`}></span>
            </span>
            <span className="text-zinc-300">
              DB {dbStatus === "connected" ? "Online" : "Offline"}
            </span>
          </div>

          <div className="h-5 w-px bg-white/10 mx-1 hidden sm:block"></div>

          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] pl-1.5 pr-3 py-1 rounded-full hover:bg-white/[0.06] transition-colors cursor-pointer group">
            <img src={user.avatar_url} alt={user.username} className="w-6 h-6 rounded-full border border-white/10 group-hover:border-cyan-400 transition-colors" />
            <span className="text-xs font-medium text-zinc-200">{user.username}</span>
            <button onClick={handleLogout} className="text-zinc-500 hover:text-rose-400 transition-colors ml-1" title="Logout">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
