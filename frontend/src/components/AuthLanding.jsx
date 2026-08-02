export default function AuthLanding({ dbStatus, initiateGithubLogin }) {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col relative overflow-hidden font-sans selection:bg-cyan-500/30">
      {/* Intense Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-cyan-600/20 blur-[180px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600/15 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />

      {/* Top Navigation */}
      <header className="w-full max-w-7xl mx-auto flex justify-between items-center p-6 z-20 relative">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-shadow duration-500">
            <svg className="w-5 h-5 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white">
            Magnus<span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">CI</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 bg-[#0a0a0c]/80 border border-white/[0.08] px-4 py-2 rounded-full backdrop-blur-md shadow-xl">
          <span className="relative flex h-2.5 w-2.5">
            {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dbStatus === "connected" ? "bg-emerald-500" : "bg-rose-500"}`} />
          </span>
          <span className="text-sm font-medium text-zinc-300">
            Engine Status: <span className={dbStatus === "connected" ? "text-emerald-400" : "text-rose-400"}>{dbStatus === "connected" ? "Online" : "Offline"}</span>
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col justify-center items-center p-6 z-10 w-full max-w-7xl mx-auto">
        <div className="w-full max-w-5xl h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent mb-12 opacity-50" />

        <div className="w-full max-w-5xl bg-[#0a0a0c]/60 border border-white/[0.08] rounded-[2.5rem] backdrop-blur-2xl shadow-2xl shadow-black/80 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.01] via-white/[0.05] to-transparent opacity-50 pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left Column: Copy & Auth */}
            <div className="p-10 lg:p-14 flex flex-col justify-center relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-6 w-fit shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
                v2.0 Automation Engine
              </div>

              <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight text-white leading-[1.1]">
                Ship Code <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">At Light Speed.</span>
              </h2>

              <p className="text-zinc-400 text-base md:text-lg leading-relaxed mb-10 max-w-md">
                Orchestrate multi-threaded background queues, run isolated containerized test-suites, and multiplex output streams instantly.
              </p>

              <div className="flex flex-col gap-4 max-w-md">
                <button
                  onClick={initiateGithubLogin}
                  className="group relative flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-bold bg-white text-zinc-950 hover:bg-zinc-200 transition-all duration-300 active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] overflow-hidden cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" className="relative z-10">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span className="relative z-10">Authenticate with GitHub</span>
                </button>
                <p className="text-center text-xs text-zinc-500 flex items-center justify-center gap-1.5 mt-2">
                  <svg className="w-4 h-4 text-emerald-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Enterprise-grade OAuth 2.0 Handshake
                </p>
              </div>
            </div>

            {/* Right Column: Mock Terminal Interface */}
            <div className="hidden lg:flex flex-col bg-[#050505]/80 border-l border-white/[0.05] p-6 relative">
              <div className="w-full h-full rounded-2xl bg-[#020202] border border-white/[0.08] shadow-2xl flex flex-col font-mono text-xs overflow-hidden relative z-10">
                <div className="h-10 bg-white/[0.03] border-b border-white/[0.05] flex items-center px-4 gap-2 select-none">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70 shadow-[0_0_5px_rgba(244,63,94,0.4)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70 shadow-[0_0_5px_rgba(245,158,11,0.4)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70 shadow-[0_0_5px_rgba(16,185,129,0.4)]" />
                  <span className="ml-2 text-zinc-500 tracking-wider">Magnus-daemon@edge-node</span>
                </div>

                <div className="p-5 flex flex-col gap-3.5 flex-1 relative">
                  <div className="flex gap-2">
                    <span className="text-cyan-500">❯</span>
                    <span className="text-zinc-300">Magnus pipeline trigger --repo backend-api --sha 8f7b2c9</span>
                  </div>

                  <div className="flex flex-col gap-1.5 pl-4 border-l border-white/[0.05] ml-1 mt-1">
                    <div className="text-zinc-500">00:00.01 <span className="text-cyan-400">[INFO]</span> Resolving build dependencies...</div>
                    <div className="text-zinc-500">00:00.45 <span className="text-cyan-400">[INFO]</span> Spawning isolated container runner...</div>
                    <div className="text-zinc-500">00:01.20 <span className="text-cyan-400">[INFO]</span> Cloning repository @ 8f7b2c9...</div>
                    <div className="text-zinc-500">00:04.12 <span className="text-cyan-400">[INFO]</span> Executing test suites (jest, eslint)...</div>
                    <div className="text-zinc-500">00:09.55 <span className="text-emerald-400">[PASS]</span> 142 tests completed successfully.</div>
                    <div className="text-zinc-500">00:10.02 <span className="text-cyan-400">[INFO]</span> Uploading artifacts to registry...</div>
                    <div className="text-zinc-500">00:12.44 <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 inline-block mt-1">[SUCCESS] Pipeline completed in 12.4s</span></div>
                  </div>

                  <div className="flex gap-2 mt-2 items-center">
                    <span className="text-cyan-500">❯</span>
                    <span className="animate-pulse w-2 h-4 bg-cyan-400 inline-block shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#020202] to-transparent pointer-events-none" />
                </div>
              </div>

              <div className="absolute top-10 right-10 w-2 h-2 rounded-full bg-cyan-500/50 blur-[2px] animate-pulse" />
              <div className="absolute bottom-20 left-4 w-1.5 h-1.5 rounded-full bg-emerald-500/50 blur-[1px] animate-bounce" />
            </div>
          </div>
        </div>

        <div className="w-full max-w-5xl h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent mt-12 opacity-30" />
      </main>
    </div>
  );
}
