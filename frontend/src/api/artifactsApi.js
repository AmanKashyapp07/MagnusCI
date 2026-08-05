import { backendUrl } from "./client";

export function getArtifactUrl(path) {
  return backendUrl(path);
}
