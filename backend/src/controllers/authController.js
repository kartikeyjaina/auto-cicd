import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User.js";
import { signToken } from "../utils/auth.js";
import { asyncHandler } from "../utils/http.js";
import { serializeUser } from "../services/projectSerializer.js";

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export const signup = asyncHandler(async (req, res) => {
  const payload = signupSchema.parse(req.body);
  const existingUser = await User.findOne({ email: payload.email.toLowerCase() });

  if (existingUser) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await User.create({
    name: payload.name,
    email: payload.email.toLowerCase(),
    passwordHash
  });

  res.status(201).json({
    token: signToken(user.id),
    user: serializeUser(user)
  });
});

export const login = asyncHandler(async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const user = await User.findOne({ email: payload.email.toLowerCase() });

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

  if (!passwordMatches) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  res.json({
    token: signToken(user.id),
    user: serializeUser(user)
  });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});
