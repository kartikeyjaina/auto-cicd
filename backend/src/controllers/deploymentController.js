import { Deployment } from "../models/Deployment.js";
import { Project } from "../models/Project.js";
import { asyncHandler } from "../utils/http.js";
import { serializeDeployment } from "../services/projectSerializer.js";

export const getDeploymentLogs = asyncHandler(async (req, res) => {
  const deployment = await Deployment.findById(req.params.deploymentId);

  if (!deployment) {
    return res.status(404).json({ message: "Deployment not found." });
  }

  const project = await Project.findOne({ _id: deployment.project, user: req.user.id });

  if (!project) {
    return res.status(404).json({ message: "Deployment not found." });
  }

  res.json({
    deployment: serializeDeployment(deployment),
    logs: deployment.logs
  });
});
