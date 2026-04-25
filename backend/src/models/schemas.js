import mongoose from "mongoose";

export const encryptedPayloadSchema = new mongoose.Schema(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    value: { type: String, required: true }
  },
  { _id: false }
);

export const deploymentLogSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);
