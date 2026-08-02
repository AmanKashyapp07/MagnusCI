export default function Footer({ repos = [], builds = [], dbStatus, dbTime }) {
  return (
    <footer className="relative z-10 border-t border-white/[0.05] bg-white/[0.01] mt-auto">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand column */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                <svg className="w-4 h-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-bold text-white tracking-tight">Magnus<span className="text-cyan-400">CI</span></span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-[200px]">
              Automated pipeline orchestration for modern engineering teams.
            </p>
            <div className="flex items-center gap-2 w-fit px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="relative flex h-1.5 w-1.5">
                {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dbStatus === "connected" ? "bg-emerald-500" : "bg-rose-500"}`} />
              </span>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {dbStatus === "connected" ? "All systems operational" : "Degraded"}
              </span>
            </div>
          </div>

          {/* Live Stats column */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Live Stats</h3>
            <div className="flex flex-col gap-2">
              {[
                { label: "Registered Workspaces", value: repos.length },
                { label: "Total Pipeline Runs", value: builds.length },
                { label: "Active Runners", value: builds.filter(b => b.status?.toLowerCase() === "running").length },
                {
                  label: "Success Rate",
                  value: (() => {
                    const done = builds.filter(b => ["success", "failed"].includes(b.status?.toLowerCase()));
                    if (!done.length) return "—";
                    return `${Math.round((done.filter(b => b.status?.toLowerCase() === "success").length / done.length) * 100)}%`;
                  })()
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-white/[0.04] last:border-0">
                  <span className="text-[11px] text-zinc-500 font-mono">{label}</span>
                  <span className="text-[11px] font-bold text-zinc-300 font-mono tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stack column */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Tech Stack</h3>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Node.js", color: "emerald" },
                { label: "PostgreSQL", color: "cyan" },
                { label: "BullMQ", color: "amber" },
                { label: "Docker", color: "sky" },
                { label: "React", color: "cyan" },
                { label: "GitHub OAuth", color: "violet" },
                { label: "Webhooks", color: "rose" },
              ].map(({ label, color }) => (
                <span
                  key={label}
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border
                    ${color === "emerald" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}
                    ${color === "cyan" ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : ""}
                    ${color === "amber" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : ""}
                    ${color === "sky" ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : ""}
                    ${color === "violet" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" : ""}
                    ${color === "rose" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : ""}
                  `}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Pipeline health column */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Pipeline Health</h3>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Webhook Listener", ok: dbStatus === "connected" },
                { label: "Database Connection", ok: dbStatus === "connected" },
                { label: "Build Queue", ok: true },
                { label: "Container Runtime", ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"}`} />
                  <span className="text-[11px] font-mono text-zinc-500">{label}</span>
                  <span className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${ok ? "text-emerald-500" : "text-rose-400"}`}>
                    {ok ? "UP" : "DOWN"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* magnus-ci.json Instructions */}
        <div className="pt-10 pb-6 border-t border-white/[0.04] mt-2">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-zinc-300 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Advanced Pipeline Orchestration (magnus-ci.json)
          </h3>
          <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start">
            <div className="flex-1 space-y-4">
              <p className="text-[12px] text-zinc-400 leading-relaxed font-mono">
                By default, MagnusCI detects your language (Node, Python, Go, C++) and automatically provisions a bulletproof test container. For complex microservices, you can override this behavior by placing a <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">magnus-ci.json</code> file at the root of your repository.
              </p>
              <p className="text-[12px] text-zinc-400 leading-relaxed font-mono">
                The Execution Engine parses this configuration as a <strong className="text-zinc-200">Directed Acyclic Graph (DAG)</strong>. It maps dependencies via the <code className="text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">"needs"</code> array and automatically spawns isolated, ephemeral Docker containers to execute independent stages concurrently!
              </p>
            </div>
            <div className="flex-1 w-full bg-[#0a0a0a] rounded-lg border border-white/[0.06] p-4 shadow-xl">
              <pre className="text-[11px] font-mono overflow-x-auto leading-relaxed">
<span className="text-rose-400">{`{`}</span>{`
  `}
  <span className="text-cyan-300">"language"</span>{`: `}<span className="text-emerald-300">"Node.js"</span>{`,
  `}
  <span className="text-cyan-300">"image"</span>{`: `}<span className="text-emerald-300">"node:20-alpine"</span>{`,
  `}
  <span className="text-cyan-300">"stages"</span>{`: `}<span className="text-rose-400">{`{`}</span>{`
    `}
    <span className="text-amber-300">"setup"</span>{`: `}<span className="text-rose-400">{`{`}</span>{` `}
      <span className="text-cyan-300">"run"</span>{`: `}<span className="text-emerald-300">"npm ci"</span>{`
    `}<span className="text-rose-400">{`}`}</span>{`,
    `}
    <span className="text-amber-300">"test"</span>{`: `}<span className="text-rose-400">{`{`}</span>{`
      `}
      <span className="text-cyan-300">"run"</span>{`: `}<span className="text-emerald-300">"npm test"</span>{`,
      `}
      <span className="text-cyan-300">"needs"</span>{`: `}<span className="text-violet-300">["setup"]</span>{`
    `}<span className="text-rose-400">{`}`}</span>{`
  `}<span className="text-rose-400">{`}`}</span>{`
`}<span className="text-rose-400">{`}`}</span>
              </pre>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono text-zinc-600">
              © {new Date().getFullYear()} MagnusCI &nbsp;·&nbsp; v2.0.0
            </span>
            <span className="hidden sm:inline text-[10px] font-mono text-zinc-700">
              Build #{builds.length > 0 ? builds[0]?.id : "—"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-700 hidden sm:inline">
              Uptime engine active
            </span>
            {dbTime && (
              <span className="text-[10px] font-mono text-zinc-700">
                DB sync: {new Date(dbTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-600 bg-white/[0.03] border border-white/[0.05] px-2.5 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.7)] animate-pulse" />
              DAEMON RUNNING
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
