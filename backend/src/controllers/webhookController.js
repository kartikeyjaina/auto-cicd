import crypto from "crypto";
import { asyncHandler } from "../utils/http.js";
import { env } from "../config/env.js";
import { normalizeRepoUrl } from "../utils/repo.js";
import { Project } from "../models/Project.js";
import { createWebhookDeployment } from "./projectController.js";

const signatureIsValid = (rawBody, signature) => {
  if (!env.githubWebhookSecret) {
    return true;
  }

  if (!signature) {
    return false;
  }

  const digest = `sha256=${crypto
    .createHmac("sha256", env.githubWebhookSecret)
    .update(rawBody)
    .digest("hex")}`;

  if (signature.length !== digest.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
};

export const handleGithubWebhook = asyncHandler(async (req, res) => {
  const event = req.headers["x-github-event"];
  const signature = req.headers["x-hub-signature-256"];

  if (!signatureIsValid(req.rawBody || "", signature)) {
    return res.status(401).json({ message: "Invalid webhook signature." });
  }

  if (event !== "push") {
    return res.json({ message: "Webhook received." });
  }

  const repoCandidates = [
    req.body?.repository?.clone_url,
    req.body?.repository?.html_url,
    req.body?.repository?.ssh_url
  ]
    .filter(Boolean)
    .map(normalizeRepoUrl);

  const project = await Project.findOne({
    normalizedRepoUrl: { $in: repoCandidates }
  });

  if (!project) {
    return res.status(404).json({ message: "Project not found for repository." });
  }

  const branch = (req.body?.ref || "").split("/").pop() || project.repoBranch;
  const commitSha = req.body?.after || "";
  const commitMessage = req.body?.head_commit?.message || "";
  const deployment = await createWebhookDeployment({
    project,
    branch,
    commitSha,
    commitMessage
  });

  res.status(202).json({
    message: "Redeploy queued from webhook.",
    deploymentId: deployment.id
  });
});
