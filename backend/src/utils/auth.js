import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signToken = (userId) =>
  jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
