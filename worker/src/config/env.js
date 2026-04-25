import dotenv from "dotenv";
import path from "path";

dotenv.config();

const resolveScriptShell = () => {
  if (process.platform === "win32") {
    return process.env.POWERSHELL_BIN?.trim() || "powershell.exe";
  }

  return process.env.POWERSHELL_BIN?.trim() || "pwsh";
};

export const env = {
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/deploy-platform",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  encryptionKey: process.env.ENCRYPTION_KEY || "dev-encryption-key-change-me",
  scriptShell: resolveScriptShell(),
  workerTmpDir: path.resolve(process.cwd(), process.env.WORKER_TMP_DIR || "./tmp"),
  scriptsDir: path.resolve(process.cwd(), process.env.SCRIPTS_DIR || "../scripts"),
  defaultBackendPort: Number(process.env.DEFAULT_BACKEND_PORT || 3000)
};
