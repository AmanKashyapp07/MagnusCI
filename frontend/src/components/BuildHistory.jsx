import React, { useState, useEffect } from 'react';

export default function BuildHistory({
  filteredBuilds,
  selectedRepo,
  setSelectedRepo,
  setSelectedBuild,
  getStatusBadgeClass
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRepo?.id, filteredBuilds.length]);

  const totalPages = Math.ceil(filteredBuilds.length / pageSize);
  const activePage = Math.min(currentPage, Math.max(totalPages, 1));
  const paginatedBuilds = filteredBuilds.slice((activePage - 1) * pageSize, activePage * pageSize);

  return (
    <div className="anthropic-card overflow-hidden flex flex-col h-full relative">
      {/* Header */}
      <div className="h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center px-6 justify-between select-none">
        <h2 className="text-xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
          Execution History
        </h2>
        
        <span className="text-[11px] font-mono text-[var(--text-secondary)] uppercase tracking-widest flex items-center gap-2">
          {selectedRepo ? selectedRepo.name : 'All Workspaces'}
          {filteredBuilds.some(b => b.status.toLowerCase() === 'running') && (
            <span className="flex h-2 w-2 relative ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-running)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-running)]"></span>
            </span>
          )}
        </span>

        <div>
          {selectedRepo ? (
            <button 
              onClick={() => setSelectedRepo(null)}
              className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 active:scale-95"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              Clear Filter
            </button>
          ) : (
            <div className="w-[90px]"></div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[var(--bg-primary)]">
        {filteredBuilds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-subtle)]">
              <svg className="w-8 h-8 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-[var(--text-primary)] font-medium mb-1 text-sm" style={{ fontFamily: 'var(--font-serif)' }}>
              {selectedRepo ? "No Executions Found" : "Awaiting Commits"}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {selectedRepo 
                ? `No execution history found for ${selectedRepo.name}.` 
                : "Push to origin to trigger pipeline stream."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {paginatedBuilds.map((build) => (
              <div key={build.id} className="relative pl-6 before:content-[''] before:absolute before:left-[11px] before:top-[30px] before:bottom-[-16px] before:w-px before:bg-[var(--border-subtle)] last:before:hidden">
                {/* Timeline Dot */}
                <div className="absolute left-0 top-3 w-6 h-6 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center z-10">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    build.status.toLowerCase() === 'success' ? 'bg-[var(--status-success)]' :
                    build.status.toLowerCase() === 'running' ? 'bg-[var(--status-running)] animate-pulse' :
                    build.status.toLowerCase() === 'failed' ? 'bg-[var(--status-failed)]' :
                    'bg-[var(--text-secondary)]'
                  }`}></div>
                </div>
                
                <div
                  onClick={() => setSelectedBuild(build)}
                  className="p-5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--text-primary)] hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
                      {build.repository_name}
                    </span>
                    <div className="flex items-center gap-2">
                      {build.artifacts && build.artifacts.length > 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          {build.artifacts.length} Artifact{build.artifacts.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className={`status-badge ${build.status.toLowerCase()}`}>
                        {build.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 text-sm font-mono text-[var(--text-secondary)]">
                    <div className="flex justify-between items-center bg-[var(--bg-primary)] px-3 py-2 rounded-lg border border-[var(--border-subtle)]">
                      <span>commit_sha</span> 
                      <span className="text-[var(--text-primary)] font-medium">{build.commit_hash?.substring(0, 7) || "null"}</span>
                    </div>
                    <div className="flex justify-between items-center px-1 text-xs">
                      <span>timestamp</span> 
                      <span>{new Date(build.created_at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Pagination */}
      {totalPages > 1 && (
        <div className="h-14 bg-[var(--bg-primary)] border-t border-[var(--border-subtle)] flex items-center px-6 justify-between select-none text-xs text-[var(--text-secondary)] font-mono">
          <span>
            PAGE: <strong className="text-[var(--text-primary)]">{activePage}</strong> / <strong className="text-[var(--text-primary)]">{totalPages}</strong>
          </span>
          <span className="hidden sm:inline text-[10px]">
            SHOWING {(activePage - 1) * pageSize + 1}-{Math.min(activePage * pageSize, filteredBuilds.length)} OF {filteredBuilds.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={activePage === 1}
              className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase font-bold tracking-wider transition-colors ${
                activePage === 1
                  ? 'border-[var(--border-subtle)] opacity-50 cursor-not-allowed bg-transparent'
                  : 'border-[var(--border-subtle)] hover:border-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
              }`}
            >
              PREV
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={activePage === totalPages}
              className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase font-bold tracking-wider transition-colors ${
                activePage === totalPages
                  ? 'border-[var(--border-subtle)] opacity-50 cursor-not-allowed bg-transparent'
                  : 'border-[var(--border-subtle)] hover:border-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
              }`}
            >
              NEXT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
