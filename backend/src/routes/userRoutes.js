import { Router } from "express";
import { saveDefaultAwsCredentials } from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.put("/aws-credentials", requireAuth, saveDefaultAwsCredentials);

export default router;
