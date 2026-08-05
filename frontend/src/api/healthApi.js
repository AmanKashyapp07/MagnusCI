import { apiRequest } from "./client";

export async function getHealth() {
  const res = await apiRequest("/health");
  return res.json();
}
