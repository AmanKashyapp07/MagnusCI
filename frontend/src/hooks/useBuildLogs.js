import { useState, useCallback, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { LOGS_POLL_INTERVAL_MS } from "../config/constants";
import { getBuildLogs } from "../api/buildsApi";
import { stripAnsi } from "../utils/logParser";

export function useBuildLogs(token, fetchWithAuth, fetchBuilds, builds) {
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [logs, setLogs] = useState("");
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef(null);

  const fetchLogs = useCallback(async (buildId, silent = false) => {
    if (!token) return;
    if (!silent) setIsLogsLoading(true);
    try {
      const { res, data } = await getBuildLogs(fetchWithAuth, buildId);
      if (res.ok && data) {
        setLogs(data.logs || "");
        if (data.build) {
          setSelectedBuild(prev => {
            if (prev && prev.id === data.build.id && prev.status === data.build.status) {
              const isLive = ["running", "pending"].includes(prev.status?.toLowerCase());
              if (!isLive) return prev;
            }
            return prev ? ({ ...prev, ...data.build }) : null;
          });
        }
      }
    } catch (err) {
      console.error("[BuildLogs] Failed to fetch logs:", err);
    } finally {
      if (!silent) setIsLogsLoading(false);
    }
  }, [token, fetchWithAuth]);

  const selectedBuildId = selectedBuild?.id;
  const selectedBuildStatus = selectedBuild?.status;

  // Real-Time WebSocket Push Streaming
  useEffect(() => {
    if (!selectedBuildId) {
      setLogs("");
      return;
    }

    // 1. Initial snapshot fetch
    fetchLogs(selectedBuildId);

    // 2. Real-time Duplex WebSocket stream connection
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5
    });

    socket.emit('join-build', selectedBuildId);

    socket.on('build-log', (data) => {
      if (data && (String(data.buildId) === String(selectedBuildId))) {
        setLogs((prev) => (prev ? prev + (data.log || data.chunk || '') : (data.log || data.chunk || '')));
      }
    });

    socket.on('build-status', (data) => {
      if (data && String(data.buildId) === String(selectedBuildId)) {
        fetchBuilds();
        setSelectedBuild(prev => prev ? { ...prev, status: data.status } : null);
      }
    });

    // 3. Low-frequency safety poll fallback for network disconnects
    const isLive = ["running", "pending"].includes(selectedBuildStatus?.toLowerCase());
    let interval = null;
    if (isLive) {
      interval = setInterval(() => {
        fetchBuilds();
        fetchLogs(selectedBuildId, true);
      }, LOGS_POLL_INTERVAL_MS * 2);
    }

    return () => {
      socket.emit('leave-build', selectedBuildId);
      socket.disconnect();
      if (interval) clearInterval(interval);
    };
  }, [selectedBuildId, selectedBuildStatus, fetchLogs, fetchBuilds]);

  useEffect(() => {
    if (selectedBuild) {
      const updated = builds.find(b => b.id === selectedBuild.id);
      if (updated && updated.status !== selectedBuild.status) {
        setSelectedBuild(updated);
      }
    }
  }, [builds, selectedBuild]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, selectedBuild]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(stripAnsi(logs));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const cleanLogs = stripAnsi(logs);
    const blob = new Blob([cleanLogs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `magnus-build-${selectedBuild?.commit_hash?.substring(0, 7) || "report"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    selectedBuild,
    setSelectedBuild,
    logs,
    isLogsLoading,
    copied,
    logsEndRef,
    handleCopyLogs,
    handleDownloadLogs
  };
}
