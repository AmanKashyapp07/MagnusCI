import React, { useState } from 'react';

export default function RepoList({ repos, selectedRepo, setSelectedRepo, onDeleteRepo }) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const totalPages = Math.ceil(repos.length / pageSize);
  const activePage = Math.min(currentPage, Math.max(totalPages, 1));
  const paginatedRepos = repos.slice((activePage - 1) * pageSize, activePage * pageSize);

  return (
    <div className="anthropic-card p-6 flex-1 flex flex-col min-h-[300px]">
      <div className="flex justify-between items-center mb-5 pb-4 border-b border-[var(--border-subtle)]">
        <h2 className="text-xl text-[var(--text-primary)] flex items-center gap-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Configured Workspaces
        </h2>
        <span className="text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] px-2.5 py-1 rounded-md text-[var(--text-secondary)] font-mono">{repos.length} Total</span>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="flex flex-col gap-3">
          {repos.length === 0 ? (
            <div className="h-full min-h-[150px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-[var(--border-subtle)] rounded-xl bg-[var(--bg-primary)]">
              <p className="text-[var(--text-secondary)] text-sm">No repositories connected.</p>
            </div>
          ) : (
            paginatedRepos.map((repo) => {
              const isSelected = selectedRepo?.id === repo.id;
              return (
                <div 
                  key={repo.id} 
                  onClick={() => setSelectedRepo(isSelected ? null : repo)}
                  className={`group flex justify-between items-center p-3.5 bg-[var(--bg-primary)] border rounded-xl hover:border-[var(--text-primary)] transition-all cursor-pointer select-none ${
                    isSelected 
                      ? 'border-[var(--text-primary)] shadow-sm' 
                      : 'border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors border border-[var(--border-subtle)] ${
                      isSelected 
                        ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' 
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] group-hover:bg-[var(--text-primary)] group-hover:text-[var(--bg-primary)]'
                    }`}>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
                        {repo.name}
                        {isSelected && (
                          <span className="text-[9px] font-bold text-[var(--bg-primary)] bg-[var(--text-primary)] px-1.5 py-0.5 rounded">Selected</span>
                        )}
                      </span>
                      <a href={repo.github_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mt-0.5 max-w-[200px] sm:max-w-xs truncate">
                        {repo.github_url}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`hidden sm:flex px-2.5 py-1 rounded-md border ${
                      isSelected 
                        ? 'bg-[var(--text-primary)] border-[var(--text-primary)]' 
                        : 'bg-[var(--bg-primary)] border-[var(--border-subtle)]'
                    }`}>
                      <span className={`text-[10px] font-mono uppercase tracking-widest ${
                        isSelected ? 'text-[var(--bg-primary)] font-bold' : 'text-[var(--text-secondary)]'
                      }`}>ID:{repo.id}</span>
                    </div>
                    {onDeleteRepo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRepo(repo);
                        }}
                        className="p-1.5 rounded-lg border border-[var(--status-failed)] bg-transparent text-[var(--status-failed)] hover:bg-[var(--status-failed)] hover:text-white transition-colors active:scale-95 flex items-center justify-center cursor-pointer"
                        title="Delete Workspace"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-5 pt-4 border-t border-[var(--border-subtle)] select-none text-xs text-[var(--text-secondary)] font-mono">
          <span>
            Showing <strong className="text-[var(--text-primary)]">{(activePage - 1) * pageSize + 1}</strong> to{" "}
            <strong className="text-[var(--text-primary)]">{Math.min(activePage * pageSize, repos.length)}</strong> of{" "}
            <strong className="text-[var(--text-primary)]">{repos.length}</strong>
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={activePage === 1}
              className={`p-1.5 rounded-lg border transition-colors ${
                activePage === 1
                  ? 'border-[var(--border-subtle)] opacity-50 cursor-not-allowed bg-transparent'
                  : 'border-[var(--border-subtle)] hover:border-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <span className="text-[var(--text-secondary)]">
              {activePage} / {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={activePage === totalPages}
              className={`p-1.5 rounded-lg border transition-colors ${
                activePage === totalPages
                  ? 'border-[var(--border-subtle)] opacity-50 cursor-not-allowed bg-transparent'
                  : 'border-[var(--border-subtle)] hover:border-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
