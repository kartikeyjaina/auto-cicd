import mongoose from "mongoose";
import { deploymentLogSchema } from "./schemas.js";

const deploymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed"],
      default: "queued"
    },
    triggerSource: {
      type: String,
      enum: ["manual", "webhook"],
      required: true
    },
    detectedType: {
      type: String,
      enum: ["unknown", "frontend", "backend"],
      default: "unknown"
    },
    branch: { type: String, default: "main" },
    commitSha: { type: String, default: "" },
    commitMessage: { type: String, default: "" },
    publicUrl: { type: String, default: "" },
    logs: { type: [deploymentLogSchema], default: [] },
    errorMessage: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const Deployment =
  mongoose.models.Deployment || mongoose.model("Deployment", deploymentSchema);
