import { API_BASE } from "../config/constants";

export const apiUrl = (path) => `${API_BASE}${path}`;

export const backendUrl = (path) => `${API_BASE.replace("/api", "")}${path}`;

export async function apiRequest(path, options = {}) {
  return fetch(apiUrl(path), options);
}

export function createAuthenticatedRequest(token, onUnauthorized) {
  return async (path, options = {}) => {
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };

    const res = await apiRequest(path, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      onUnauthorized();
      throw new Error("Session expired. Please login again.");
    }

    return res;
  };
}
