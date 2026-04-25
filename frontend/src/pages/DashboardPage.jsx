import { useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";
import ProjectCard from "../components/ProjectCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useInterval } from "../hooks/useInterval.js";

const emptyProjectForm = {
  name: "",
  repoUrl: "",
  repoBranch: "main",
  envText: "",
  accessKeyId: "",
  secretAccessKey: "",
  region: ""
};

const emptyAwsForm = {
  accessKeyId: "",
  secretAccessKey: "",
  region: ""
};

const parseEnvText = (value) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((accumulator, line) => {
      const [key, ...rest] = line.split("=");
      if (key) {
        accumulator[key.trim()] = rest.join("=").trim();
      }
      return accumulator;
    }, {});

const formatResourceSummary = (project) => {
  if (project.assignedResources?.frontend?.bucketName) {
    return `S3 ${project.assignedResources.frontend.bucketName}`;
  }

  if (project.assignedResources?.backend?.instanceId) {
    return `EC2 ${project.assignedResources.backend.instanceId}`;
  }

  return "Not assigned yet";
};

export default function DashboardPage() {
  const { token, user, logout, saveDefaultAwsCredentials, refreshUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [awsForm, setAwsForm] = useState(emptyAwsForm);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [deploymentDetail, setDeploymentDetail] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [savingAws, setSavingAws] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [deployingProjectId, setDeployingProjectId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const deploymentProject = deploymentDetail
    ? projects.find((project) =>
        project.deploymentHistory.some(
          (deployment) => deployment.id === deploymentDetail.deployment.id
        )
      )
    : null;

  const loadProjects = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingProjects(true);
    }

    try {
      const data = await apiRequest("/api/projects", { token });
      setProjects(data.projects);

      if (!selectedDeploymentId) {
        const latestDeployment = data.projects.flatMap((project) => project.deploymentHistory)[0];
        if (latestDeployment) {
          setSelectedDeploymentId(latestDeployment.id);
        }
      }
    } catch (loadError) {
      setErrorMessage(loadError.message);
    } finally {
      if (!silent) {
        setLoadingProjects(false);
      }
    }
  };

  const loadDeploymentLogs = async () => {
    if (!selectedDeploymentId) {
      return;
    }

    try {
      const data = await apiRequest(`/api/deployments/${selectedDeploymentId}/logs`, { token });
      setDeploymentDetail(data);
    } catch (loadError) {
      setErrorMessage(loadError.message);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadDeploymentLogs();
  }, [selectedDeploymentId]);

  useInterval(() => {
    loadProjects({ silent: true });
  }, 5000);

  useInterval(() => {
    loadDeploymentLogs();
  }, selectedDeploymentId ? 2000 : null);

  const handleSaveAws = async (event) => {
    event.preventDefault();
    setSavingAws(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await saveDefaultAwsCredentials(awsForm);
      await refreshUser();
      setAwsForm(emptyAwsForm);
      setStatusMessage("Default AWS credentials saved.");
    } catch (saveError) {
      setErrorMessage(saveError.message);
    } finally {
      setSavingAws(false);
    }
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    setCreatingProject(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const payload = {
        name: projectForm.name,
        repoUrl: projectForm.repoUrl,
        repoBranch: projectForm.repoBranch,
        envVariables: parseEnvText(projectForm.envText)
      };

      if (projectForm.accessKeyId && projectForm.secretAccessKey && projectForm.region) {
        payload.awsCredentials = {
          accessKeyId: projectForm.accessKeyId,
          secretAccessKey: projectForm.secretAccessKey,
          region: projectForm.region
        };
      }

      await apiRequest("/api/projects", {
        method: "POST",
        token,
        body: JSON.stringify(payload)
      });

      setProjectForm(emptyProjectForm);
      setStatusMessage("Project created.");
      await loadProjects();
    } catch (createError) {
      setErrorMessage(createError.message);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeploy = async (projectId) => {
    setDeployingProjectId(projectId);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const data = await apiRequest(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        token
      });
      setSelectedDeploymentId(data.deploymentId);
      setStatusMessage("Deployment queued.");
      await loadProjects();
    } catch (deployError) {
      setErrorMessage(deployError.message);
    } finally {
      setDeployingProjectId("");
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-ink-900/70 px-6 py-6 shadow-glow lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.24em] text-sea-300">Deploy Platform</p>
            <h1 className="font-display text-4xl text-sand-100">AWS deployment control plane</h1>
            <p className="max-w-3xl text-sm leading-7 text-sand-200/75">
              Queue deploys from GitHub repos, reuse infrastructure on redeploy, and watch worker
              logs update in near real time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md bg-white/5 px-4 py-3 text-sm text-sand-200/80">
              {user?.name}
              <div className="text-xs text-sand-200/55">{user?.email}</div>
            </div>
            <button className="button-secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        {(statusMessage || errorMessage) && (
          <div
            className={`rounded-md px-4 py-3 text-sm ${
              errorMessage
                ? "border border-coral-400/30 bg-coral-400/10 text-coral-400"
                : "border border-sea-400/30 bg-sea-400/10 text-sea-200"
            }`}
          >
            {errorMessage || statusMessage}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-6">
            <div className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl text-sand-100">Default AWS credentials</h2>
                  <p className="mt-1 text-sm text-sand-200/65">
                    Stored encrypted and used when a project does not provide project-specific keys.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sand-200/65">
                  {user?.hasDefaultAwsCredentials ? "Saved" : "Missing"}
                </div>
              </div>

              <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSaveAws}>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Access key ID</span>
                  <input
                    className="input"
                    value={awsForm.accessKeyId}
                    onChange={(event) =>
                      setAwsForm((current) => ({ ...current, accessKeyId: event.target.value }))
                    }
                    placeholder="AKIA..."
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Secret access key</span>
                  <input
                    className="input"
                    type="password"
                    value={awsForm.secretAccessKey}
                    onChange={(event) =>
                      setAwsForm((current) => ({
                        ...current,
                        secretAccessKey: event.target.value
                      }))
                    }
                    placeholder="AWS secret"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Region</span>
                  <input
                    className="input"
                    value={awsForm.region}
                    onChange={(event) =>
                      setAwsForm((current) => ({ ...current, region: event.target.value }))
                    }
                    placeholder="ap-south-1"
                    required
                  />
                </label>
                <div className="md:col-span-3">
                  <button className="button-primary" disabled={savingAws} type="submit">
                    {savingAws ? "Saving..." : "Save default credentials"}
                  </button>
                </div>
              </form>
            </div>

            <div className="panel p-5">
              <div className="mb-4">
                <h2 className="font-display text-2xl text-sand-100">Create project</h2>
                <p className="mt-1 text-sm text-sand-200/65">
                  Add a GitHub repository, optional project-level AWS credentials, and env vars for
                  the worker to write into `.env`.
                </p>
              </div>

              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateProject}>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Project name</span>
                  <input
                    className="input"
                    value={projectForm.name}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="marketing-site"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Branch</span>
                  <input
                    className="input"
                    value={projectForm.repoBranch}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, repoBranch: event.target.value }))
                    }
                    placeholder="main"
                    required
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm text-sand-200/80">GitHub repository URL</span>
                  <input
                    className="input"
                    type="url"
                    value={projectForm.repoUrl}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, repoUrl: event.target.value }))
                    }
                    placeholder="https://github.com/acme/my-app"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Project AWS access key</span>
                  <input
                    className="input"
                    value={projectForm.accessKeyId}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        accessKeyId: event.target.value
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-sand-200/80">Project AWS secret</span>
                  <input
                    className="input"
                    type="password"
                    value={projectForm.secretAccessKey}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        secretAccessKey: event.target.value
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm text-sand-200/80">Project AWS region</span>
                  <input
                    className="input"
                    value={projectForm.region}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, region: event.target.value }))
                    }
                    placeholder="Optional if defaults are saved"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm text-sand-200/80">Environment variables</span>
                  <textarea
                    className="input min-h-40 resize-y"
                    value={projectForm.envText}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, envText: event.target.value }))
                    }
                    placeholder={"NODE_ENV=production\nPORT=3000\nAPI_KEY=secret"}
                  />
                </label>
                <div className="md:col-span-2">
                  <button className="button-primary" disabled={creatingProject} type="submit">
                    {creatingProject ? "Creating..." : "Create project"}
                  </button>
                </div>
              </form>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl text-sand-100">Projects</h2>
                  <p className="mt-1 text-sm text-sand-200/65">
                    Each project holds its repo, encrypted AWS keys, env config, and deployment
                    history.
                  </p>
                </div>
                <div className="rounded-md bg-white/5 px-3 py-2 text-sm text-sand-200/70">
                  {projects.length} active projects
                </div>
              </div>

              {loadingProjects ? (
                <div className="panel p-6 text-sm text-sand-200/70">Loading projects...</div>
              ) : projects.length ? (
                <div className="grid gap-4">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      deploying={deployingProjectId === project.id}
                      onDeploy={handleDeploy}
                      onSelectDeployment={setSelectedDeploymentId}
                    />
                  ))}
                </div>
              ) : (
                <div className="panel p-6 text-sm text-sand-200/70">
                  No projects yet. Add a GitHub repo and we can start deploying.
                </div>
              )}
            </section>
          </div>

          <aside className="panel flex min-h-[640px] flex-col p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-sand-100">Live deployment logs</h2>
                <p className="mt-1 text-sm text-sand-200/65">
                  Polling the backend log API while the worker streams command output into MongoDB.
                </p>
              </div>
              {deploymentDetail?.deployment?.status ? (
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sand-200/70">
                  {deploymentDetail.deployment.status}
                </span>
              ) : null}
            </div>

            {deploymentDetail ? (
              <>
                <div className="grid gap-3 text-sm text-sand-200/75 md:grid-cols-2">
                  <div className="rounded-md bg-white/5 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-sand-200/55">Trigger</div>
                    <div className="mt-2 text-sand-100">{deploymentDetail.deployment.triggerSource}</div>
                  </div>
                  <div className="rounded-md bg-white/5 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-sand-200/55">Detected type</div>
                    <div className="mt-2 text-sand-100">{deploymentDetail.deployment.detectedType}</div>
                  </div>
                  <div className="rounded-md bg-white/5 p-3 md:col-span-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-sand-200/55">Public URL</div>
                    <div className="mt-2 break-all text-sand-100">
                      {deploymentDetail.deployment.publicUrl || "Pending"}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-white/10 bg-[#0b1115] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-sand-200/45">
                    <span>Streaming output</span>
                    <span>
                      {deploymentDetail.logs.length} lines |{" "}
                      {deploymentProject
                        ? formatResourceSummary(deploymentProject)
                        : "Matching project unavailable"}
                    </span>
                  </div>
                  <div className="h-[520px] overflow-auto rounded-md bg-black/40 p-3 font-mono text-xs leading-6 text-sea-300">
                    {deploymentDetail.logs.length ? (
                      deploymentDetail.logs.map((log, index) => (
                        <div key={`${log.createdAt}-${index}`}>
                          <span className="mr-3 text-sand-200/35">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </span>
                          <span>{log.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sand-200/55">No log lines yet.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-sand-200/55">
                Select a deployment from the project list to inspect logs.
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
