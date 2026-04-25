import { Router } from "express";
import { handleGithubWebhook } from "../controllers/webhookController.js";

const router = Router();

router.post("/", handleGithubWebhook);
router.post("/github", handleGithubWebhook);

export default router;
