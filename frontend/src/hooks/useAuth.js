import { useState, useEffect, useCallback } from "react";
import { createAuthenticatedRequest } from "../api/client";
import { getCurrentUser, getGithubLoginUrl } from "../api/authApi";

export function useAuth() {
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectToken = params.get("token");
    if (redirectToken) {
      localStorage.setItem("token", redirectToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      return redirectToken;
    }
    return localStorage.getItem("token") || "";
  });

  const [user, setUser] = useState(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
  }, []);

  const fetchWithAuth = useCallback(
    async (path, options = {}) => {
      const authRequest = createAuthenticatedRequest(token, handleLogout);
      return authRequest(path, options);
    },
    [token, handleLogout]
  );

  const fetchUser = useCallback(async () => {
    if (!token) return;
    try {
      const { res, data } = await getCurrentUser(fetchWithAuth);
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
    window.location.href = getGithubLoginUrl();
  };

  return {
    token,
    user,
    fetchWithAuth,
    handleLogout,
    initiateGithubLogin
  };
}
