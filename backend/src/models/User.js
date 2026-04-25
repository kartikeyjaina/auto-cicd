import mongoose from "mongoose";
import { encryptedPayloadSchema } from "./schemas.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    defaultAwsCredentials: { type: encryptedPayloadSchema, default: null }
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
