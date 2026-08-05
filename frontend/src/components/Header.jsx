import React from 'react';

export default function Header({ user, dbStatus, handleLogout, isDarkMode, setIsDarkMode }) {
  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/80 backdrop-blur-xl transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl tracking-tight text-[var(--text-primary)] hidden sm:block" style={{ fontFamily: 'var(--font-serif)' }}>
            Magnus<span className="text-[var(--accent)] italic">CI</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <span className="relative flex h-2 w-2">
              {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus === "connected" ? "bg-[var(--status-success)]" : "bg-[var(--status-failed)]"}`}></span>
            </span>
            <span className="text-[var(--text-secondary)] tracking-wide">
              DB {dbStatus === "connected" ? "Online" : "Offline"}
            </span>
          </div>

          <div className="h-5 w-px bg-[var(--border-subtle)] mx-1 hidden sm:block"></div>
          
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] pl-1.5 pr-3 py-1 rounded-full hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group">
            <img src={user.avatar_url} alt={user.username} className="w-6 h-6 rounded-full border border-[var(--border-subtle)] group-hover:border-[var(--text-primary)] transition-colors" />
            <span className="text-xs font-medium text-[var(--text-primary)]">{user.username}</span>
            <button onClick={handleLogout} className="text-[var(--text-secondary)] hover:text-[var(--status-failed)] transition-colors ml-1" title="Logout">
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
