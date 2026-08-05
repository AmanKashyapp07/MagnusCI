import { useState, useCallback, useEffect } from "react";
import { HEALTH_POLL_INTERVAL_MS } from "../config/constants";
import { getHealth } from "../api/healthApi";
import {
  deleteRepository,
  getRepositories,
  registerRepository,
} from "../api/repositoriesApi";
import { getBuilds } from "../api/buildsApi";

export function useDashboardData(token, fetchWithAuth, showToast) {
  const [dbStatus, setDbStatus] = useState("checking");
  const [dbTime, setDbTime] = useState("");
  const [repos, setRepos] = useState([]);
  const [builds, setBuilds] = useState([]);
  
  const [repoName, setRepoName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const checkHealth = useCallback(async () => {
    try {
      const data = await getHealth();
      if (data.status === "healthy") {
        setDbStatus("connected");
        setDbTime(data.time);
      } else {
        setDbStatus("disconnected");
      }
    } catch {
      setDbStatus("disconnected");
    }
  }, []);

  const fetchRepos = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getRepositories(fetchWithAuth);
      if (Array.isArray(data)) {
        setRepos(data);
      }
    } catch (err) {
      console.error("[Dashboard] Failed to fetch repositories:", err);
    }
  }, [token, fetchWithAuth]);

  const fetchBuilds = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getBuilds(fetchWithAuth);
      if (Array.isArray(data)) {
        setBuilds(data);
      }
    } catch (err) {
      console.error("[Dashboard] Failed to fetch builds:", err);
    }
  }, [token, fetchWithAuth]);

  useEffect(() => {
    checkHealth();
    if (token) {
      fetchRepos();
      fetchBuilds();
    }
  }, [token, checkHealth, fetchRepos, fetchBuilds]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkHealth();
      if (token) {
        fetchBuilds();
      }
    }, HEALTH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [token, checkHealth, fetchBuilds]);

  const handleRegisterRepo = async (e) => {
    e.preventDefault();
    if (!repoName || !repoUrl) {
      setError("Please fill out all fields.");
      showToast("Please fill out all fields.", "error");
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const { res, data } = await registerRepository(fetchWithAuth, {
        name: repoName,
        githubUrl: repoUrl,
      });

      if (res.ok) {
        setMessage("Repository registered successfully!");
        showToast("Repository registered successfully!", "success");
        setTimeout(() => setMessage(""), 4000);
        setRepoName("");
        setRepoUrl("");
        fetchRepos();
      } else {
        setError(data.error || "Failed to register repository.");
        showToast(data.error || "Failed to register repository.", "error");
      }
    } catch {
      setError("Server connection failed.");
      showToast("Server connection failed.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const executeDeleteRepo = async (repoId, setSelectedRepo) => {
    try {
      const { res, data } = await deleteRepository(fetchWithAuth, repoId);
      if (res.ok) {
        showToast("Workspace and corresponding execution history deleted successfully.", "success");
        if (setSelectedRepo) {
          setSelectedRepo(prev => (prev && prev.id === repoId ? null : prev));
        }
        fetchRepos();
        fetchBuilds();
      } else {
        let errorMsg = "Failed to delete workspace.";
        if (data) {
          errorMsg = data.error || errorMsg;
        }
        showToast(errorMsg, "error");
      }
    } catch {
      showToast("Server connection failed.", "error");
    }
  };

  return {
    dbStatus,
    dbTime,
    repos,
    builds,
    repoName,
    setRepoName,
    repoUrl,
    setRepoUrl,
    isLoading,
    error,
    message,
    fetchRepos,
    fetchBuilds,
    handleRegisterRepo,
    executeDeleteRepo
  };
}
