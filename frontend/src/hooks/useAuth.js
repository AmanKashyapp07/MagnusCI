import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../config/constants";

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
  }, []);

  // Check URL parameters for OAuth token redirect from GitHub callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectToken = params.get("token");
    if (redirectToken) {
      localStorage.setItem("token", redirectToken);
      setToken(redirectToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const fetchWithAuth = useCallback(
    async (url, options = {}) => {
      const headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        throw new Error("Session expired. Please login again.");
      }
      return res;
    },
    [token, handleLogout]
  );

  const fetchUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/me`);
      const data = await res.json();
      if (res.ok) {
        setUser(data);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error("[Auth] User profile fetch error:", err);
      handleLogout();
    }
  }, [token, fetchWithAuth, handleLogout]);

  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token, fetchUser]);

  const initiateGithubLogin = () => {
    window.location.href = `${API_BASE}/auth/github`;
  };

  return {
    token,
    user,
    fetchWithAuth,
    handleLogout,
    initiateGithubLogin
  };
}
