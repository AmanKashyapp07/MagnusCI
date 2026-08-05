import React, { useState, useMemo, useEffect } from 'react';
import MetricsChart from './MetricsChart';
import { parseLogsIntoSteps } from '../utils/logParser';

const stripAnsi = (str) => {
  if (!str) return "";
  
  // 1. Strip ANSI escape codes
  let cleaned = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

  // 2. Process carriage returns (\r) and filter out interactive Jest Tty updates (like "RUNS  ...")
  const lines = cleaned.split('\n');
  const processedLines = [];

  for (let line of lines) {
    let finalLine = line;
    if (line.includes('\r')) {
      const segments = line.split('\r');
      for (const segment of segments) {
        if (segment.trim().length > 0) {
          finalLine = segment;
        }
      }
    }
    
    const trimmed = finalLine.trim();
    if (trimmed === "RUNS  ..." || trimmed === "RUNS" || trimmed === "\\" || trimmed === "/" || trimmed === "|" || trimmed === "-") {
      continue;
    }
    processedLines.push(finalLine);
  }

  // Deduplicate empty lines
  return processedLines.filter((line, index, arr) => {
    if (line.trim() === "" && index > 0 && arr[index - 1].trim() === "") {
      return false;
    }
    return true;
  }).join('\n');
};

export default function BuildModal({
  selectedBuild,
  setSelectedBuild,
  isLogsLoading,
  logs,
  handleDownloadLogs,
  handleCopyLogs,
  copied,
  getStatusBadgeClass,
  getArtifactUrl
}) {
  if (!selectedBuild) return null;

  const [viewMode, setViewMode] = useState('steps');
  const [expandedSteps, setExpandedSteps] = useState({});

  const parsedSteps = useMemo(() => {
    return parseLogsIntoSteps(logs, selectedBuild.status);
  }, [logs, selectedBuild.status]);

  // Auto-expand failed or running steps when logs/status changes
  useEffect(() => {
    if (parsedSteps.length > 0) {
      setExpandedSteps(prev => {
        const next = { ...prev };
        let hasChanges = false;
        parsedSteps.forEach(step => {
          if ((step.status === 'failed' || step.status === 'running') && !next[step.id]) {
            next[step.id] = true;
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }
  }, [parsedSteps]);

  const toggleStep = (stepId) => {
    setExpandedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBuild(null)}>
      <div className="w-full max-w-6xl h-[85vh] bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="h-16 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] flex items-center px-6 justify-between select-none">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
              Execution Details
            </h2>
            <div className="h-5 w-px bg-[var(--border-subtle)] mx-2"></div>
            
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-primary)] font-bold text-sm">{selectedBuild.repository_name}</span>
              <span className="text-[var(--text-secondary)] font-mono text-xs bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                {selectedBuild.commit_hash?.substring(0, 7) || "null"}
              </span>
              <span className={`status-badge ${selectedBuild.status.toLowerCase()}`}>
                {selectedBuild.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadLogs}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download
            </button>

            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              {copied ? (
                <><svg className="w-4 h-4 text-[var(--status-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy Logs</>
              )}
            </button>

            <div className="w-px h-5 bg-[var(--border-subtle)] mx-2"></div>

            <button
              onClick={() => setSelectedBuild(null)}
              className="p-2 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Artifacts Panel */}
        {selectedBuild.artifacts && selectedBuild.artifacts.length > 0 && (
          <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-6 py-3 flex flex-wrap gap-3 items-center select-none">
            <span className="text-[var(--text-secondary)] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              Artifacts:
            </span>
            {selectedBuild.artifacts.map((art, idx) => (
              art.type === 'file' ? (
                <a
                  key={idx}
                  href={getArtifactUrl(art.path)}
                  download
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  ⬇ Download {art.name}
                </a>
              ) : (
                <a
                  key={idx}
                  href={getArtifactUrl(art.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {art.name}
                </a>
              )
            ))}
          </div>
        )}

        {/* Metrics Panel */}
        <MetricsChart rawMetrics={selectedBuild.metrics} status={selectedBuild.status} />

        {/* Logs Control Panel */}
        <div className="bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] px-6 py-3 flex items-center justify-between select-none">
          <div className="flex items-center gap-4 text-xs font-semibold text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5 uppercase tracking-widest">
              Build Steps
            </span>
            {viewMode === 'steps' && parsedSteps.length > 0 && (
              <span className="text-[var(--text-primary)] font-mono">
                {parsedSteps.filter(s => s.status === 'success').length} / {parsedSteps.length} passed
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {viewMode === 'steps' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedSteps(parsedSteps.reduce((acc, step) => ({ ...acc, [step.id]: true }), {}))}
                  className="px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded-full border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={() => setExpandedSteps({})}
                  className="px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded-full border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Collapse All
                </button>
              </div>
            )}
            
            <div className="h-4 w-px bg-[var(--border-subtle)]"></div>
            
            {/* View Mode Toggle */}
            <div className="flex bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-full p-1 select-none">
              <button
                onClick={() => setViewMode('steps')}
                className={`px-4 py-1 rounded-full text-xs font-semibold transition-all ${
                  viewMode === 'steps'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Steps
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-4 py-1 rounded-full text-xs font-semibold transition-all ${
                  viewMode === 'raw'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Raw
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body (Logs Viewport) */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#1E1E1E] text-[#D4D4D4] font-mono text-sm custom-scrollbar">
          {isLogsLoading && !logs ? (
             <div className="flex items-center justify-center h-full gap-3 opacity-70">
               <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               Loading log stream...
             </div>
          ) : viewMode === 'steps' ? (
            <div className="flex flex-col gap-3">
              {parsedSteps.map((step) => {
                const isExpanded = !!expandedSteps[step.id];
                return (
                  <div
                    key={step.id}
                    className={`border rounded-lg overflow-hidden transition-all duration-200 ${
                      step.status === 'failed'
                        ? 'border-[#F87171] bg-[#F87171]/5'
                        : step.status === 'running'
                        ? 'border-[#60A5FA] bg-[#60A5FA]/5'
                        : 'border-[#333333] bg-[#252526]'
                    }`}
                  >
                    {/* Step Header */}
                    <div
                      onClick={() => toggleStep(step.id)}
                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-[#2A2D2E] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Status Icon */}
                        {step.status === 'success' && (
                          <svg className="w-5 h-5 text-[#4ADE80] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {step.status === 'failed' && (
                          <svg className="w-5 h-5 text-[#F87171] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {step.status === 'running' && (
                          <svg className="w-5 h-5 text-[#60A5FA] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                        {step.status === 'pending' && (
                          <div className="w-5 h-5 rounded-full border border-[#404040] shrink-0 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#404040]"></div>
                          </div>
                        )}
                        <span className={`text-sm font-bold ${
                          step.status === 'failed'
                            ? 'text-[#F87171]'
                            : step.status === 'running'
                            ? 'text-[#60A5FA]'
                            : 'text-[#D4D4D4]'
                        }`}>
                          {step.name}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {step.status !== 'pending' && (
                          <span className="text-xs font-mono text-[#858585]">
                            {step.duration || '0.0s'}
                          </span>
                        )}
                        <svg
                          className={`w-4 h-4 text-[#858585] transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-[#D4D4D4]' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Step Body (Logs) */}
                    {isExpanded && (
                      <div className="border-t border-[#333333] bg-[#1E1E1E] p-4 font-mono text-[13px] leading-relaxed overflow-x-auto custom-scrollbar flex flex-col gap-1">
                        {step.lines.length === 0 ? (
                          <div className="text-[#858585] italic">No logs generated for this step.</div>
                        ) : (
                          step.lines.map((line, lineIdx) => {
                            const isErrorLine = line.includes('❌') || line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');
                            const isWarningLine = line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn');
                            return (
                              <div
                                key={lineIdx}
                                className={`px-2 -mx-2 rounded transition-colors hover:bg-[#2A2D2E] ${
                                  isErrorLine
                                    ? 'text-[#F87171] bg-[#F87171]/5'
                                    : isWarningLine
                                    ? 'text-[#FBBF24]'
                                    : 'text-[#D4D4D4]'
                                }`}
                              >
                                {line}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-all leading-relaxed flex flex-col gap-1">
              {stripAnsi(logs).split('\n').map((line, idx) => (
                <div key={idx} className="hover:bg-[#2A2D2E] px-2 -mx-2 rounded transition-colors">{line || ' '}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
