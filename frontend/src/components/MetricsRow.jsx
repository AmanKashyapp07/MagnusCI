import React from 'react';

export default function MetricsRow({ reposCount, buildsCount, activeRunners, successRate }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div className="bg-white/[0.02] border border-white/[0.08] p-5 rounded-2xl backdrop-blur-xl flex flex-col gap-1">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
           <svg className="w-4 h-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
           Workspaces
        </span>
        <div className="text-3xl font-bold text-white mt-1">{reposCount}</div>
      </div>
      
      <div className="bg-white/[0.02] border border-white/[0.08] p-5 rounded-2xl backdrop-blur-xl flex flex-col gap-1">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
           <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
           Total Executions
        </span>
        <div className="text-3xl font-bold text-white mt-1">{buildsCount}</div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] p-5 rounded-2xl backdrop-blur-xl flex flex-col gap-1 relative overflow-hidden">
        {activeRunners > 0 && <div className="absolute inset-0 bg-cyan-500/5 animate-pulse"></div>}
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2 relative z-10">
           <svg className={`w-4 h-4 ${activeRunners > 0 ? 'text-cyan-400' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
           Active Runners
        </span>
        <div className="text-3xl font-bold text-white mt-1 flex items-baseline gap-2 relative z-10">
          {activeRunners}
          {activeRunners > 0 && <span className="text-xs text-cyan-400 font-medium bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">Running</span>}
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] p-5 rounded-2xl backdrop-blur-xl flex flex-col gap-1">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
           <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           Success Rate
        </span>
        <div className="text-3xl font-bold text-white mt-1 flex items-baseline gap-1">
          {successRate}<span className="text-lg text-zinc-500">%</span>
        </div>
      </div>
    </div>
  );
}
