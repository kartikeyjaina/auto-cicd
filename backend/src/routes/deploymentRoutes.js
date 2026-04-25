import { Router } from "express";
import { getDeploymentLogs } from "../controllers/deploymentController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:deploymentId/logs", requireAuth, getDeploymentLogs);

export default router;
