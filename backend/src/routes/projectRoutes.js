import { Router } from "express";
import {
  createProject,
  listProjects,
  triggerDeployment,
  updateProject
} from "../controllers/projectController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listProjects);
router.post("/", createProject);
router.put("/:projectId", updateProject);
router.post("/:projectId/deploy", triggerDeployment);

export default router;
