import { Deployment } from "../models/Deployment.js";

export const appendDeploymentLog = async (deploymentId, message) => {
  await Deployment.findByIdAndUpdate(deploymentId, {
    $push: {
      logs: {
        message,
        createdAt: new Date()
      }
    }
  });
};
