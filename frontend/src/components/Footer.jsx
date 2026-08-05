export default function Footer({ repos = [], builds = [], dbStatus, dbTime }) {
  return (
    <footer className="relative z-10 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] mt-auto transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand column */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <h1 className="text-xl tracking-tight text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
              Magnus<span className="text-[var(--accent)] italic">CI</span>
            </h1>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-[200px]">
              Automated pipeline orchestration for modern engineering teams.
            </p>
            <div className="flex items-center gap-2 w-fit px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <span className="relative flex h-1.5 w-1.5">
                {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75" />}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dbStatus === "connected" ? "bg-[var(--status-success)]" : "bg-[var(--status-failed)]"}`} />
              </span>
              <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                {dbStatus === "connected" ? "Systems Operational" : "Degraded"}
              </span>
            </div>
          </div>

          {/* Live Stats column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Live Stats</h3>
            <div className="flex flex-col gap-3">
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
                <div key={label} className="flex justify-between items-center py-1 border-b border-[var(--border-subtle)] last:border-0">
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stack column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Tech Stack</h3>
            <div className="flex flex-wrap gap-2">
              {[
                "Node.js", "PostgreSQL", "BullMQ", "Kubernetes", "React", "OAuth", "MinIO"
              ].map((label) => (
                <span
                  key={label}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Pipeline health column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Pipeline Health</h3>
            <div className="flex flex-col gap-3">
              {[
                { label: "Webhook Listener", ok: dbStatus === "connected" },
                { label: "Database Connection", ok: dbStatus === "connected" },
                { label: "Build Queue", ok: true },
                { label: "K8s Runtime", ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-[var(--status-success)]" : "bg-[var(--status-failed)]"}`} />
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider ${ok ? "text-[var(--status-success)]" : "text-[var(--status-failed)]"}`}>
                    {ok ? "UP" : "DOWN"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* magnus-ci.json Instructions */}
        <div className="pt-10 pb-8 border-t border-[var(--border-subtle)]">
          <h3 className="text-lg text-[var(--text-primary)] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
            Advanced Pipeline Orchestration (magnus-ci.json)
          </h3>
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="flex-1 space-y-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                By default, MagnusCI detects your language and automatically provisions a test container. For complex microservices, you can override this behavior by placing a <code className="px-1.5 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded font-mono text-[var(--text-primary)]">magnus-ci.json</code> file at the root of your repository.
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                The Execution Engine parses this configuration as a <strong className="text-[var(--text-primary)]">Directed Acyclic Graph (DAG)</strong>. It maps dependencies via the <code className="font-mono bg-[var(--bg-secondary)] px-1 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-primary)]">"needs"</code> array and automatically spawns isolated Kubernetes Jobs to execute independent stages concurrently.
              </p>
            </div>
            <div className="flex-1 w-full bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-5 shadow-sm">
              <pre className="text-[12px] font-mono overflow-x-auto leading-relaxed text-[var(--text-primary)]">
{`{
  "language": "Node.js",
  "image": "node:20-alpine",
  "stages": {
    "setup": { 
      "run": "npm ci"
    },
    "test": {
      "run": "npm test",
      "needs": ["setup"]
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-[var(--text-secondary)]">
              © {new Date().getFullYear()} MagnusCI &nbsp;·&nbsp; v2.0.0
            </span>
            <span className="hidden sm:inline text-[11px] text-[var(--text-secondary)]">
              Build #{builds.length > 0 ? builds[0]?.id : "—"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {dbTime && (
              <span className="text-[11px] text-[var(--text-secondary)]">
                DB sync: {new Date(dbTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-running)] animate-pulse" />
              DAEMON RUNNING
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
