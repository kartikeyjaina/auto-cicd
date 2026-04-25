import fs from "fs/promises";
import path from "path";

const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "tmp",
  "temp"
]);

const collectCandidateDirs = async (rootDir, maxDepth = 2) => {
  const queue = [{ dir: rootDir, depth: 0 }];
  const results = [];

  while (queue.length) {
    const current = queue.shift();
    results.push(current.dir);

    if (current.depth >= maxDepth) {
      continue;
    }

    const entries = await fs.readdir(current.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      queue.push({
        dir: path.join(current.dir, entry.name),
        depth: current.depth + 1
      });
    }
  }

  return results;
};

const detectInDirectory = async (appDir, repoDir) => {
  const packageJsonPath = path.join(appDir, "package.json");
  const viteConfigExists =
    (await pathExists(path.join(appDir, "vite.config.js"))) ||
    (await pathExists(path.join(appDir, "vite.config.ts")));
  const nextConfigExists =
    (await pathExists(path.join(appDir, "next.config.js"))) ||
    (await pathExists(path.join(appDir, "next.config.mjs")));
  let packageJson = {};

  if (await pathExists(packageJsonPath)) {
    packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  }

  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  const relativeDir = path.relative(repoDir, appDir) || ".";
  const dirHints = relativeDir.toLowerCase();
  let type = null;
  let score = -1;

  if (viteConfigExists || nextConfigExists || dependencies.react || dependencies.next) {
    type = "frontend";
    score = 10;
  }

  if (dependencies.express || dependencies.fastify) {
    type = "backend";
    score = 10;
  }

  if (!type) {
    return null;
  }

  if (relativeDir === ".") {
    score += 2;
  }

  if (type === "backend" && /(backend|api|server)/.test(dirHints)) {
    score += 3;
  }

  if (type === "frontend" && /(frontend|web|client|app)/.test(dirHints)) {
    score += 3;
  }

  return {
    type,
    score,
    appDir,
    relativeDir,
    packageJson
  };
};

export const detectProjectType = async (repoDir) => {
  const candidateDirs = await collectCandidateDirs(repoDir, 2);
  const matches = (await Promise.all(candidateDirs.map((dir) => detectInDirectory(dir, repoDir))))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  if (matches.length) {
    const best = matches[0];
    return {
      type: best.type,
      appDir: best.appDir,
      relativeDir: best.relativeDir,
      packageJson: best.packageJson
    };
  }

  throw new Error(
    "Unable to detect project type. Expected a frontend app (vite/next/react) or backend app (express/fastify), including in common nested folders like backend/ or frontend/."
  );
};
