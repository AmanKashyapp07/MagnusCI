import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Hooks
import { useAuth } from "./hooks/useAuth";

// Pages
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

/**
 * Main Application Router Component
 * Clean URL separation for /login and /dashboard routes
 */
function App() {
  const { token, user, fetchWithAuth, handleLogout, initiateGithubLogin } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage
              token={token}
              dbStatus="connected"
              initiateGithubLogin={initiateGithubLogin}
            />
          }
        />
        <Route
          path="/dashboard"
          element={
            <DashboardPage
              token={token}
              user={user}
              fetchWithAuth={fetchWithAuth}
              handleLogout={handleLogout}
            />
          }
        />
        <Route
          path="/"
          element={<Navigate to={token ? "/dashboard" : "/login"} replace />}
        />
        <Route
          path="*"
          element={<Navigate to={token ? "/dashboard" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;