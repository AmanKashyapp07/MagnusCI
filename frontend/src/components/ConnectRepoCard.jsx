import React from 'react';

export default function ConnectRepoCard({
  repoName,
  setRepoName,
  repoUrl,
  setRepoUrl,
  error,
  message,
  isLoading,
  handleRegisterRepo
}) {
  return (
    <div className="anthropic-card p-8">
      <div className="mb-6">
        <h2 className="text-2xl text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Connect Repository
        </h2>
        <p className="text-[var(--text-secondary)] text-sm">Register a new GitHub webhook origin target.</p>
      </div>
      
      <form onSubmit={handleRegisterRepo} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="repo-name" className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Project Name</label>
            <input
              id="repo-name"
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Magnus-core-api"
              className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="repo-url" className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Repository URL</label>
            <input
              id="repo-url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
              required
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-2 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex-1 mr-4">
            {error && <div className="text-xs text-[var(--status-failed)] font-medium flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</div>}
            {message && <div className="text-xs text-[var(--status-success)] font-medium flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{message}</div>}
          </div>
          
          <button type="submit" disabled={isLoading} className="anthropic-btn group">
            {isLoading ? (
              <><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Connecting...</>
            ) : (
              <>Connect Hook <span className="anthropic-btn-arrow inline-block">→</span></>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
