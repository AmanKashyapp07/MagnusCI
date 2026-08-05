import { useState, useMemo, useEffect } from "react";
import { Navigate } from "react-router-dom";

// Hooks
import { useToast } from "../hooks/useToast";
import { useDashboardData } from "../hooks/useDashboardData";
import { useBuildLogs } from "../hooks/useBuildLogs";

// Config & Utilities
import { API_BASE, getStatusBadgeClass } from "../config/constants";

// Components
import Header from "../components/Header";
import MetricsRow from "../components/MetricsRow";
import ConnectRepoCard from "../components/ConnectRepoCard";
import RepoList from "../components/RepoList";
import BuildHistory from "../components/BuildHistory";
import BuildModal from "../components/BuildModal";
import Footer from "../components/Footer";
import ToastNotification from "../components/ToastNotification";

export default function DashboardPage({ token, user, fetchWithAuth, handleLogout }) {
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const { toast, setToast, showToast } = useToast();

  const {
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
    fetchBuilds,
    handleRegisterRepo,
    executeDeleteRepo
  } = useDashboardData(token, fetchWithAuth, showToast);

  const {
    selectedBuild,
    setSelectedBuild,
    logs,
    isLogsLoading,
    copied,
    handleCopyLogs,
    handleDownloadLogs
  } = useBuildLogs(token, fetchWithAuth, fetchBuilds, builds);

  const [selectedRepo, setSelectedRepo] = useState(null);
  
  // Theme Toggle State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("magnus-theme") === "dark";
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("magnus-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("magnus-theme", "light");
    }
  }, [isDarkMode]);

  const handleDeleteRepoPrompt = (repo) => {
    setToast({
      message: `Are you sure you want to delete workspace "${repo.name}" and all of its execution history? This action cannot be undone.`,
      type: "confirm",
      repoId: repo.id
    });
  };

  // Filter builds based on selected repository
  const filteredBuilds = useMemo(() => {
    if (!selectedRepo) return builds;
    return builds.filter(
      (b) =>
        b.repository_id === selectedRepo.id ||
        b.repository_name?.toLowerCase() === selectedRepo.name?.toLowerCase()
    );
  }, [builds, selectedRepo]);

  // Derived Dashboard Statistics
  const activeRunners = useMemo(
    () => builds.filter((b) => b.status?.toLowerCase() === "running").length,
    [builds]
  );

  const successRate = useMemo(() => {
    const completed = builds.filter((b) =>
      ["success", "failed"].includes(b.status?.toLowerCase())
    );
    if (!completed.length) return 0;
    const success = completed.filter((b) => b.status?.toLowerCase() === "success").length;
    return Math.round((success / completed.length) * 100);
  }, [builds]);

  return (
    <div className={`min-h-screen relative overflow-hidden flex flex-col ${isDarkMode ? 'dark' : ''}`}>
      {/* Ambient Background Glows */}
      <div className="fixed top-[-25%] right-[-10%] w-[60%] h-[60%] bg-[var(--bg-secondary)] blur-[180px] rounded-full pointer-events-none opacity-50" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--border-subtle)] blur-[150px] rounded-full pointer-events-none opacity-30" />

      {/* Navigation Bar */}
      <Header user={user} dbStatus={dbStatus} handleLogout={handleLogout} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      {/* Main Workspace Dashboard */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 min-h-[calc(100vh-4rem)] flex flex-col relative z-10">
        <MetricsRow
          reposCount={repos.length}
          buildsCount={builds.length}
          activeRunners={activeRunners}
          successRate={successRate}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
          {/* Left Column: Repository Connections & Management */}
          <section className="lg:col-span-7 flex flex-col gap-6">
            <ConnectRepoCard
              repoName={repoName}
              setRepoName={setRepoName}
              repoUrl={repoUrl}
              setRepoUrl={setRepoUrl}
              error={error}
              message={message}
              isLoading={isLoading}
              handleRegisterRepo={handleRegisterRepo}
            />

            <RepoList
              repos={repos}
              selectedRepo={selectedRepo}
              setSelectedRepo={setSelectedRepo}
              onDeleteRepo={handleDeleteRepoPrompt}
            />
          </section>

          {/* Right Column: Build Executions & Log Streams */}
          <section className="lg:col-span-5 h-full min-h-[500px]">
            <BuildHistory
              filteredBuilds={filteredBuilds}
              selectedRepo={selectedRepo}
              setSelectedRepo={setSelectedRepo}
              setSelectedBuild={setSelectedBuild}
              getStatusBadgeClass={getStatusBadgeClass}
            />
          </section>
        </div>
      </main>

      {/* System Footer */}
      <Footer repos={repos} builds={builds} dbStatus={dbStatus} dbTime={dbTime} />

      {/* Log Terminal Modal */}
      <BuildModal
        selectedBuild={selectedBuild}
        setSelectedBuild={setSelectedBuild}
        isLogsLoading={isLogsLoading}
        logs={logs}
        handleDownloadLogs={handleDownloadLogs}
        handleCopyLogs={handleCopyLogs}
        copied={copied}
        getStatusBadgeClass={getStatusBadgeClass}
        API_BASE={API_BASE}
      />

      {/* Toast Notification Overlay */}
      <ToastNotification
        toast={toast}
        setToast={setToast}
        executeDeleteRepo={(repoId) => executeDeleteRepo(repoId, setSelectedRepo)}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `
      }} />
    </div>
  );
}
