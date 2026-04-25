import { z } from "zod";
import { asyncHandler } from "../utils/http.js";
import { encryptJson } from "../utils/crypto.js";
import { env } from "../config/env.js";
import { serializeUser } from "../services/projectSerializer.js";

const awsSchema = z.object({
  accessKeyId: z.string().min(4),
  secretAccessKey: z.string().min(8),
  region: z.string().min(4)
});

export const saveDefaultAwsCredentials = asyncHandler(async (req, res) => {
  const payload = awsSchema.parse(req.body);
  req.user.defaultAwsCredentials = encryptJson(payload, env.encryptionKey);
  await req.user.save();

  res.json({
    message: "Default AWS credentials saved.",
    user: serializeUser(req.user)
  });
});
