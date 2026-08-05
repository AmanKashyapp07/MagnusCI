export async function getRepositories(authRequest) {
  const res = await authRequest("/repositories");
  return res.json();
}

export async function registerRepository(authRequest, { name, githubUrl }) {
  const res = await authRequest("/repositories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, github_url: githubUrl }),
  });

  const data = await res.json();
  return { res, data };
}

export async function deleteRepository(authRequest, repoId) {
  const res = await authRequest(`/repositories/${repoId}`, {
    method: "DELETE",
  });

  try {
    const data = await res.json();
    return { res, data };
  } catch {
    return { res, data: null };
  }
}
