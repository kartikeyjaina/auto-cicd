const normalizeGithubPath = (value) => value.replace(/\.git$/, "").replace(/\/+$/, "");

export const normalizeRepoUrl = (repoUrl) => {
  const trimmed = repoUrl.trim();

  if (trimmed.startsWith("git@github.com:")) {
    const path = trimmed.replace("git@github.com:", "");
    return normalizeGithubPath(`https://github.com/${path}`).toLowerCase();
  }

  try {
    const url = new URL(trimmed);
    const normalized = `${url.protocol}//${url.host}${normalizeGithubPath(url.pathname)}`;
    return normalized.toLowerCase();
  } catch {
    return normalizeGithubPath(trimmed).toLowerCase();
  }
};
