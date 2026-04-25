import mongoose from "mongoose";
import { encryptedPayloadSchema } from "./schemas.js";

const assignedFrontendSchema = new mongoose.Schema(
  {
    bucketName: String,
    distributionId: String,
    distributionDomain: String,
    publicUrl: String
  },
  { _id: false }
);

const assignedBackendSchema = new mongoose.Schema(
  {
    instanceId: String,
    publicIp: String,
    keyName: String,
    sshUser: { type: String, default: "ubuntu" },
    privateKeyPem: { type: encryptedPayloadSchema, default: null },
    publicUrl: String
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    repoUrl: { type: String, required: true },
    normalizedRepoUrl: { type: String, required: true },
    repoBranch: { type: String, default: "main" },
    type: {
      type: String,
      enum: ["unknown", "frontend", "backend"],
      default: "unknown"
    },
    awsCredentials: { type: encryptedPayloadSchema, required: true },
    envVariables: { type: encryptedPayloadSchema, default: null },
    deploymentHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Deployment" }],
    lastDeployment: { type: mongoose.Schema.Types.ObjectId, ref: "Deployment", default: null },
    assignedResources: {
      frontend: { type: assignedFrontendSchema, default: () => ({}) },
      backend: { type: assignedBackendSchema, default: () => ({}) }
    }
  },
  { timestamps: true }
);

export const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);
