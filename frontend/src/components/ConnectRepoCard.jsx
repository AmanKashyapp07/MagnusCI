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
    <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 backdrop-blur-xl shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-32 bg-cyan-500/5 blur-[100px] rounded-full pointer-events-none"></div>
      
      <div className="mb-6 relative z-10">
        <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Connect Repository
        </h2>
        <p className="text-zinc-400 text-sm">Register a new GitHub webhook origin target.</p>
      </div>
      
      <form onSubmit={handleRegisterRepo} className="flex flex-col gap-5 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="repo-name" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Project Name</label>
            <input
              id="repo-name"
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Magnus-core-api"
              className="bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-inner"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="repo-url" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Repository URL</label>
            <input
              id="repo-url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className="bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-inner"
              required
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <div className="flex-1 mr-4">
            {error && <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 rounded-xl flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</div>}
            {message && <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 rounded-xl flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{message}</div>}
          </div>
          
          <button type="submit" disabled={isLoading} className="whitespace-nowrap px-6 py-3 rounded-xl font-semibold bg-cyan-600 text-white hover:bg-cyan-500 active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)] hover:shadow-[0_0_20px_rgba(8,145,178,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-cyan-600 flex items-center gap-2 text-sm">
            {isLoading ? (
              <><svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Hooking...</>
            ) : "Create Hook"}
          </button>
        </div>
      </form>
    </div>
  );
}
