import React from 'react';

export default function AuthLanding({ dbStatus, initiateGithubLogin }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col relative overflow-hidden transition-colors duration-300">
      
      {/* Top Navigation */}
      <header className="w-full max-w-7xl mx-auto flex justify-between items-center p-6 z-20 relative border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl tracking-tight text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
            Magnus<span className="text-[var(--accent)] italic">CI</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full">
          <span className="relative flex h-2 w-2">
            {dbStatus === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-success)] opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dbStatus === "connected" ? "bg-[var(--status-success)]" : "bg-[var(--status-failed)]"}`} />
          </span>
          <span className="text-xs font-medium text-[var(--text-secondary)] tracking-wide">
            DB {dbStatus === "connected" ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col pt-24 pb-16 px-6 z-10 w-full max-w-7xl mx-auto animate-fade-in">
        <div className="max-w-4xl mb-24">
          <h2 className="text-5xl md:text-7xl mb-8 leading-[1.05] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
            An Ephemeral Container-Based CI/CD Orchestration Engine.
          </h2>
          <p className="text-lg md:text-xl text-[var(--text-secondary)] mb-10 max-w-2xl leading-relaxed">
            MagnusCI integrates secure webhook validation, a high-performance DAG parallel execution engine, and serverless Kubernetes runners to produce auditable build artifacts and zero-cost scaling.
          </p>
          <button 
            onClick={initiateGithubLogin}
            className="anthropic-btn group text-base px-6 py-3"
          >
            Connect GitHub
            <span className="anthropic-btn-arrow inline-block ml-1">→</span>
          </button>
        </div>

        {/* Feature Cards in Anthropic Release Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="anthropic-card p-8 flex flex-col h-full">
            <h3 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-serif)' }}>Cryptographic Webhook Validation</h3>
            <p className="text-[var(--text-secondary)] mb-12 flex-grow leading-relaxed text-sm">
              Secures your CI/CD pipeline using HMAC SHA-256 signatures, ensuring that only authenticated push events from GitHub trigger pipeline executions.
            </p>
            <div className="mt-auto">
              <div className="divider my-4"></div>
              <div className="flex justify-between text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                <span>Category</span>
                <span>Security</span>
              </div>
            </div>
          </div>

          <div className="anthropic-card p-8 flex flex-col h-full">
            <h3 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-serif)' }}>Topological DAG Engine</h3>
            <p className="text-[var(--text-secondary)] mb-12 flex-grow leading-relaxed text-sm">
              Parses complex pipeline dependencies into a Directed Acyclic Graph (DAG), enabling optimal parallel execution of build stages and reducing total execution time.
            </p>
            <div className="mt-auto">
              <div className="divider my-4"></div>
              <div className="flex justify-between text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                <span>Category</span>
                <span>Performance</span>
              </div>
            </div>
          </div>

          <div className="anthropic-card p-8 flex flex-col h-full">
            <h3 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-serif)' }}>Serverless Kubernetes Runners</h3>
            <p className="text-[var(--text-secondary)] mb-12 flex-grow leading-relaxed text-sm">
              Dynamically provisions ephemeral Kubernetes Job pods for each build stage. Complete with a global MinIO S3 object storage cache for blazing fast dependency restoration.
            </p>
            <div className="mt-auto">
              <div className="divider my-4"></div>
              <div className="flex justify-between text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                <span>Category</span>
                <span>Scaling</span>
              </div>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
