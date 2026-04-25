import { z } from "zod";
import { Project } from "../models/Project.js";
import { Deployment } from "../models/Deployment.js";
import { asyncHandler } from "../utils/http.js";
import { normalizeRepoUrl } from "../utils/repo.js";
import { decryptJson, encryptJson } from "../utils/crypto.js";
import { env } from "../config/env.js";
import { addDeploymentJob } from "../queues/deploymentQueue.js";
import { serializeProject } from "../services/projectSerializer.js";

const awsSchema = z.object({
  accessKeyId: z.string().min(4),
  secretAccessKey: z.string().min(8),
  region: z.string().min(4)
});

const createProjectSchema = z.object({
  name: z.string().min(2).max(120),
  repoUrl: z.string().url(),
  repoBranch: z.string().min(1).max(120).default("main"),
  envVariables: z.record(z.string()).optional(),
  awsCredentials: awsSchema.optional()
});

const updateProjectSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  repoBranch: z.string().min(1).max(120).optional(),
  envVariables: z.record(z.string()).optional(),
  awsCredentials: awsSchema.optional()
});

const createDeploymentForProject = async ({
  project,
  userId,
  triggerSource,
  branch,
  commitSha = "",
  commitMessage = ""
}) => {
  const deployment = await Deployment.create({
    user: userId,
    project: project.id,
    status: "queued",
    triggerSource,
    branch,
    commitSha,
    commitMessage,
    logs: [{ message: "Deployment queued." }]
  });

  project.deploymentHistory.unshift(deployment.id);
  project.lastDeployment = deployment.id;
  await project.save();
  await addDeploymentJob(deployment.id);

  return deployment;
};

export const listProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find({ user: req.user.id })
    .populate("lastDeployment")
    .populate({
      path: "deploymentHistory",
      options: { sort: { createdAt: -1 }, limit: 10 }
    })
    .sort({ updatedAt: -1 });

  res.json({ projects: projects.map(serializeProject) });
});

export const createProject = asyncHandler(async (req, res) => {
  const payload = createProjectSchema.parse(req.body);
  const awsCredentials =
    payload.awsCredentials ||
    (req.user.defaultAwsCredentials
      ? decryptJson(req.user.defaultAwsCredentials, env.encryptionKey)
      : null);

  if (!awsCredentials) {
    return res
      .status(400)
      .json({ message: "AWS credentials are required or must be saved on your profile." });
  }

  const project = await Project.create({
    user: req.user.id,
    name: payload.name,
    repoUrl: payload.repoUrl,
    normalizedRepoUrl: normalizeRepoUrl(payload.repoUrl),
    repoBranch: payload.repoBranch,
    awsCredentials: encryptJson(awsCredentials, env.encryptionKey),
    envVariables: encryptJson(payload.envVariables || {}, env.encryptionKey)
  });

  const hydrated = await Project.findById(project.id)
    .populate("lastDeployment")
    .populate({
      path: "deploymentHistory",
      options: { sort: { createdAt: -1 }, limit: 10 }
    });

  res.status(201).json({ project: serializeProject(hydrated) });
});

export const updateProject = asyncHandler(async (req, res) => {
  const payload = updateProjectSchema.parse(req.body);
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user.id });

  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (payload.name) {
    project.name = payload.name;
  }

  if (payload.repoBranch) {
    project.repoBranch = payload.repoBranch;
  }

  if (payload.envVariables) {
    project.envVariables = encryptJson(payload.envVariables, env.encryptionKey);
  }

  if (payload.awsCredentials) {
    project.awsCredentials = encryptJson(payload.awsCredentials, env.encryptionKey);
  }

  await project.save();

  const hydrated = await Project.findById(project.id)
    .populate("lastDeployment")
    .populate({
      path: "deploymentHistory",
      options: { sort: { createdAt: -1 }, limit: 10 }
    });

  res.json({ project: serializeProject(hydrated) });
});

export const triggerDeployment = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user.id });

  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  const deployment = await createDeploymentForProject({
    project,
    userId: req.user.id,
    triggerSource: "manual",
    branch: project.repoBranch
  });

  res.status(202).json({ deploymentId: deployment.id, status: deployment.status });
});

export const createWebhookDeployment = async ({ project, branch, commitSha, commitMessage }) =>
  createDeploymentForProject({
    project,
    userId: project.user,
    triggerSource: "webhook",
    branch,
    commitSha,
    commitMessage
  });
