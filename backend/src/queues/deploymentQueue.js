import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const DEPLOYMENT_QUEUE_NAME = "deployment-jobs";

export const deploymentQueue = new Queue(DEPLOYMENT_QUEUE_NAME, {
  connection: redisConnection
});

export const addDeploymentJob = async (deploymentId) =>
  deploymentQueue.add(
    "deploy-project",
    { deploymentId },
    {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 1
    }
  );
