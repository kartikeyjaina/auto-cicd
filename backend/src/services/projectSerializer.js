import { decryptJson } from "../utils/crypto.js";
import { env } from "../config/env.js";

export const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  hasDefaultAwsCredentials: Boolean(user.defaultAwsCredentials),
  createdAt: user.createdAt
});

export const serializeDeployment = (deployment) => ({
  id: deployment.id,
  projectId: deployment.project?.toString?.() || deployment.project,
  status: deployment.status,
  triggerSource: deployment.triggerSource,
  detectedType: deployment.detectedType,
  branch: deployment.branch,
  commitSha: deployment.commitSha,
  commitMessage: deployment.commitMessage,
  publicUrl: deployment.publicUrl,
  errorMessage: deployment.errorMessage,
  startedAt: deployment.startedAt,
  finishedAt: deployment.finishedAt,
  createdAt: deployment.createdAt,
  updatedAt: deployment.updatedAt,
  logCount: deployment.logs?.length || 0
});

export const serializeProject = (project) => {
  const envVars = decryptJson(project.envVariables, env.encryptionKey) || {};

  return {
    id: project.id,
    name: project.name,
    repoUrl: project.repoUrl,
    repoBranch: project.repoBranch,
    type: project.type,
    hasAwsCredentials: Boolean(project.awsCredentials),
    envVariables: envVars,
    assignedResources: project.assignedResources,
    deploymentHistory: (project.deploymentHistory || []).map(serializeDeployment),
    lastDeployment: project.lastDeployment ? serializeDeployment(project.lastDeployment) : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
};
