export default function ToastNotification({ toast, setToast, executeDeleteRepo }) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in max-w-sm w-full bg-[#0a0a0c]/95 border border-white/[0.08] rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex gap-3">
        {toast.type === "confirm" ? (
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        ) : toast.type === "error" ? (
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        <div className="flex-1">
          <p className="text-xs font-mono text-zinc-300 leading-relaxed">{toast.message}</p>

          {toast.type === "confirm" ? (
            <div className="flex gap-2 mt-3 justify-end">
              <button
                onClick={() => setToast(null)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = toast.repoId;
                  setToast(null);
                  executeDeleteRepo(id);
                }}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-rose-600 border border-rose-500/30 text-white hover:bg-rose-500 transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)] cursor-pointer"
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="flex justify-end mt-1">
              <button
                onClick={() => setToast(null)}
                className="text-[9px] font-mono text-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer"
              >
                dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
