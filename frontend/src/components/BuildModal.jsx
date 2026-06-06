import React from 'react';
import MetricsChart from './MetricsChart';

const stripAnsi = (str) => {
  if (!str) return "";
  
  // 1. Strip ANSI escape codes
  let cleaned = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  
  // 2. Remove npm spinner symbols (like \|/-\|/-\|/-)
  cleaned = cleaned.replace(/[\\|/-\s]{4,}/g, (match) => {
    if (/^[\\|/-\s]+$/.test(match) && (match.includes('\\') || match.includes('/') || match.includes('|'))) {
      return ' ';
    }
    return match;
  });

  // 3. Process carriage returns (\r) and filter out interactive Jest Tty updates (like "RUNS  ...")
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
  API_BASE
}) {
  if (!selectedBuild) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#020202]/80 backdrop-blur-md" onClick={() => setSelectedBuild(null)}>
      <div className="w-full max-w-6xl h-[85vh] bg-[#050505] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="h-14 bg-white/[0.03] border-b border-white/[0.08] flex items-center px-5 justify-between select-none">
          <div className="flex items-center gap-4">
            {/* Decorative Window Controls */}
            <div className="flex gap-2">
              <div className="w-3.5 h-3.5 rounded-full bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
              <div className="w-3.5 h-3.5 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            </div>
            
            <div className="h-5 w-px bg-white/10 mx-2"></div>
            
            <div className="flex items-center gap-3">
              <span className="text-zinc-200 font-bold text-sm">{selectedBuild.repository_name}</span>
              <span className="text-cyan-400 font-mono text-xs bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                {selectedBuild.commit_hash?.substring(0, 7) || "null"}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${getStatusBadgeClass(selectedBuild.status)}`}>
                {selectedBuild.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadLogs}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Logs
            </button>

            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-300 transition-colors"
            >
              {copied ? (
                <><svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy Logs</>
              )}
            </button>

            <div className="w-px h-5 bg-white/10 mx-1"></div>

            <button
              onClick={() => setSelectedBuild(null)}
              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors flex items-center justify-center group"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Artifacts Panel */}
        {selectedBuild.artifacts && selectedBuild.artifacts.length > 0 && (
          <div className="bg-white/[0.02] border-b border-white/[0.08] px-5 py-3 flex flex-wrap gap-3 items-center select-none">
            <span className="text-zinc-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              Build Artifacts:
            </span>
            {selectedBuild.artifacts.map((art, idx) => (
              art.type === 'file' ? (
                <a
                  key={idx}
                  href={`${API_BASE.replace('/api', '')}${art.path}`}
                  download
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/30 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-all shadow-[0_0_12px_rgba(99,102,241,0.05)] hover:shadow-[0_0_12px_rgba(99,102,241,0.15)] active:scale-[0.97]"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  ⬇ Download {art.name}
                </a>
              ) : (
                <a
                  key={idx}
                  href={`${API_BASE.replace('/api', '')}${art.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-all shadow-[0_0_12px_rgba(6,182,212,0.05)] hover:shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {art.name}
                </a>
              )
            ))}
          </div>
        )}

        {/* Metrics Panel */}
        <MetricsChart rawMetrics={selectedBuild.metrics} status={selectedBuild.status} />

        {/* Modal Body (Terminal) */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#020202] font-mono text-xs sm:text-sm text-zinc-300 custom-scrollbar">
          {isLogsLoading && !logs ? (
             <div className="flex items-center justify-center h-full text-zinc-500 gap-3">
               <svg className="animate-spin h-5 w-5 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               Loading logs stream...
             </div>
          ) : (
            <div className="whitespace-pre-wrap break-all leading-relaxed flex flex-col gap-1">
              {stripAnsi(logs).split('\n').map((line, idx) => (
                <div key={idx} className="hover:bg-white/[0.02] px-2 -mx-2 rounded transition-colors">{line || ' '}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
