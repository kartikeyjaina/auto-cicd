import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/deploy-platform",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  encryptionKey: process.env.ENCRYPTION_KEY || "dev-encryption-key-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || ""
};
