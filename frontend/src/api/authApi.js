import { apiUrl } from "./client";

export function getGithubLoginUrl() {
  return apiUrl("/auth/github");
}

export async function getCurrentUser(authRequest) {
  const res = await authRequest("/auth/me");
  const data = await res.json();
  return { res, data };
}
