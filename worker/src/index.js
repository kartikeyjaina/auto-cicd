import fs from "fs/promises";
import { Worker } from "bullmq";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { redisConnection } from "./config/redis.js";
import { processDeploymentJob } from "./services/deploymentProcessor.js";

const DEPLOYMENT_QUEUE_NAME = "deployment-jobs";

const start = async () => {
  await fs.mkdir(env.workerTmpDir, { recursive: true });
  await connectDatabase(env.mongodbUri);

  const worker = new Worker(DEPLOYMENT_QUEUE_NAME, processDeploymentJob, {
    connection: redisConnection,
    concurrency: 2
  });

  worker.on("completed", (job) => {
    console.log(`Deployment job ${job.id} completed.`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Deployment job ${job?.id} failed:`, error.message);
  });

  console.log("Worker is listening for deployment jobs.");
};

start().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
