import fs from "fs/promises";
import path from "path";
import { Deployment } from "../models/Deployment.js";
import { Project } from "../models/Project.js";
import { env } from "../config/env.js";
import { appendDeploymentLog } from "../utils/deploymentLogger.js";
import { decryptJson, encryptJson } from "../utils/crypto.js";
import { runCommandStreaming } from "../utils/command.js";
import { detectProjectType } from "./projectDetection.js";

const renderEnvFile = (variables) =>
  Object.entries(variables)
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, "\\n")}`)
    .join("\n");

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";

const parseScriptResult = (resultLines) =>
  resultLines.reduce((accumulator, line) => {
    const [key, ...rest] = line.split("=");
    accumulator[key.replace("RESULT_", "").toLowerCase()] = rest.join("=");
    return accumulator;
  }, {});

const executeScript = async ({
  scriptPath,
  scriptEnv,
  cwd,
  deploymentId
}) => {
  const resultLines = [];

  await runCommandStreaming({
    command: env.scriptShell,
    args:
      process.platform === "win32"
        ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
        : ["-NoProfile", "-File", scriptPath],
    cwd,
    env: scriptEnv,
    onLine: async (line) => {
      if (line.startsWith("RESULT_")) {
        resultLines.push(line);
      }
      await appendDeploymentLog(deploymentId, line);
    }
  });

  return parseScriptResult(resultLines);
};

const markDeployment = async (deploymentId, update) =>
  Deployment.findByIdAndUpdate(deploymentId, update, { new: true });

const cleanupWorkdir = async (workdir) => {
  if (!workdir) {
    return;
  }

  await fs.rm(workdir, { recursive: true, force: true });
};

export const processDeploymentJob = async (job) => {
  const { deploymentId } = job.data;
  const deployment = await Deployment.findById(deploymentId);

  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found.`);
  }

  const project = await Project.findById(deployment.project);

  if (!project) {
    throw new Error(`Project ${deployment.project} not found.`);
  }

  let workdir = "";

  try {
    await markDeployment(deploymentId, {
      status: "running",
      startedAt: new Date(),
      errorMessage: ""
    });
    await appendDeploymentLog(deploymentId, "Worker accepted deployment job.");
    await appendDeploymentLog(deploymentId, `Using shell: ${env.scriptShell}`);

    const awsCredentials = decryptJson(project.awsCredentials, env.encryptionKey);
    const envVariables = decryptJson(project.envVariables, env.encryptionKey) || {};
    const branch = deployment.branch || project.repoBranch || "main";

    workdir = await fs.mkdtemp(path.join(env.workerTmpDir, `${project.id}-`));
    const repoDir = path.join(workdir, "repo");
    const envFilePath = path.join(workdir, ".env");
    const privateKeyPath = path.join(workdir, "deploy-key.pem");

    await appendDeploymentLog(deploymentId, `Cloning ${project.repoUrl} (${branch})`);
    await runCommandStreaming({
      command: "git",
      args: ["clone", "--depth", "1", "--branch", branch, project.repoUrl, repoDir],
      cwd: workdir,
      onLine: async (line) => {
        await appendDeploymentLog(deploymentId, line);
      }
    });

    await fs.writeFile(envFilePath, renderEnvFile(envVariables), "utf8");
    const detection = await detectProjectType(repoDir);
    const appDir = detection.appDir || repoDir;
    project.type = detection.type;

    await appendDeploymentLog(
      deploymentId,
      `Detected ${detection.type} application${detection.relativeDir && detection.relativeDir !== "." ? ` in ${detection.relativeDir}` : "."}`
    );

    let result = {};

    if (detection.type === "frontend") {
      const scriptEnv = {
        ...process.env,
        AWS_ACCESS_KEY_ID: awsCredentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: awsCredentials.secretAccessKey,
        AWS_DEFAULT_REGION: awsCredentials.region,
        APP_DIR: appDir,
        PROJECT_ID: project.id,
        PROJECT_SLUG: slugify(project.name),
        EXISTING_BUCKET_NAME: project.assignedResources.frontend?.bucketName || "",
        EXISTING_DISTRIBUTION_ID: project.assignedResources.frontend?.distributionId || ""
      };

      result = await executeScript({
        scriptPath: path.join(env.scriptsDir, "deploy-frontend.ps1"),
        scriptEnv,
        cwd: appDir,
        deploymentId
      });

      project.assignedResources.frontend = {
        bucketName: result.bucket_name || project.assignedResources.frontend?.bucketName || "",
        distributionId:
          result.distribution_id || project.assignedResources.frontend?.distributionId || "",
        distributionDomain:
          result.distribution_domain ||
          project.assignedResources.frontend?.distributionDomain ||
          "",
        publicUrl: result.public_url || project.assignedResources.frontend?.publicUrl || ""
      };
    } else {
      const startScript =
        detection.packageJson?.scripts?.start && detection.packageJson.scripts.start.trim()
          ? "npm run start"
          : "node index.js";
      const appPort = Number(envVariables.PORT || env.defaultBackendPort);
      const existingPrivateKey =
        project.assignedResources.backend?.privateKeyPem &&
        decryptJson(project.assignedResources.backend.privateKeyPem, env.encryptionKey);

      if (existingPrivateKey?.privateKeyPem) {
        await fs.writeFile(privateKeyPath, `${existingPrivateKey.privateKeyPem}\n`, {
          encoding: "utf8",
          mode: 0o600
        });
      }

      const scriptEnv = {
        ...process.env,
        AWS_ACCESS_KEY_ID: awsCredentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: awsCredentials.secretAccessKey,
        AWS_DEFAULT_REGION: awsCredentials.region,
        APP_DIR: appDir,
        ENV_FILE: envFilePath,
        PRIVATE_KEY_PATH: privateKeyPath,
        PROJECT_ID: project.id,
        PROJECT_SLUG: slugify(project.name),
        EXISTING_INSTANCE_ID: project.assignedResources.backend?.instanceId || "",
        EXISTING_KEY_NAME: project.assignedResources.backend?.keyName || "",
        APP_PORT: String(appPort),
        START_COMMAND: startScript
      };

      result = await executeScript({
        scriptPath: path.join(env.scriptsDir, "deploy-backend.ps1"),
        scriptEnv,
        cwd: appDir,
        deploymentId
      });

      const privateKeyPem =
        (await fs.readFile(privateKeyPath, "utf8").catch(() => "")).trim() ||
        existingPrivateKey?.privateKeyPem ||
        "";

      project.assignedResources.backend = {
        instanceId: result.instance_id || project.assignedResources.backend?.instanceId || "",
        publicIp: result.public_ip || project.assignedResources.backend?.publicIp || "",
        keyName: result.key_name || project.assignedResources.backend?.keyName || "",
        sshUser: result.ssh_user || project.assignedResources.backend?.sshUser || "ubuntu",
        privateKeyPem: privateKeyPem
          ? encryptJson({ privateKeyPem }, env.encryptionKey)
          : project.assignedResources.backend?.privateKeyPem || null,
        publicUrl: result.public_url || project.assignedResources.backend?.publicUrl || ""
      };
    }

    deployment.detectedType = detection.type;
    deployment.publicUrl = result.public_url || "";
    deployment.status = "succeeded";
    deployment.finishedAt = new Date();
    project.lastDeployment = deployment.id;

    await Promise.all([project.save(), deployment.save()]);
    await appendDeploymentLog(deploymentId, `Deployment finished: ${deployment.publicUrl}`);
  } catch (error) {
    await appendDeploymentLog(deploymentId, `Deployment failed: ${error.message}`);
    await markDeployment(deploymentId, {
      status: "failed",
      errorMessage: error.message,
      finishedAt: new Date()
    });
    throw error;
  } finally {
    await cleanupWorkdir(workdir);
  }
};
