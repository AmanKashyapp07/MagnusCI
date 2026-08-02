export const API_BASE = window.location.origin.includes("localhost:5173")
  ? "http://localhost:5001/api"
  : "/api";

export const HEALTH_POLL_INTERVAL_MS = 3000;
export const LOGS_POLL_INTERVAL_MS = 2000;

export const getStatusBadgeClass = (status) => {
  switch (status?.toLowerCase()) {
    case "pending":
      return "bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
    case "running":
      return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)] animate-pulse";
    case "success":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
    case "failed":
      return "bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]";
    default:
      return "bg-zinc-500/10 text-zinc-300 border border-zinc-500/30";
  }
};
