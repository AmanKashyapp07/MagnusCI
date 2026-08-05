export async function getBuilds(authRequest) {
  const res = await authRequest("/builds");
  return res.json();
}

export async function getBuildLogs(authRequest, buildId) {
  const res = await authRequest(`/builds/${buildId}/logs`);
  const data = res.ok ? await res.json() : null;
  return { res, data };
}
