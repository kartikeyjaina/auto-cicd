import clsx from "clsx";

const statusClasses = {
  queued: "bg-sand-200/15 text-sand-100",
  running: "bg-sea-400/15 text-sea-300",
  succeeded: "bg-sea-500/20 text-sea-300",
  failed: "bg-coral-400/15 text-coral-400"
};

export default function ProjectCard({ project, onDeploy, onSelectDeployment, deploying }) {
  const latestDeployment = project.lastDeployment;
  const frontendUrl = project.assignedResources?.frontend?.publicUrl;
  const backendUrl = project.assignedResources?.backend?.publicUrl;
  const publicUrl = latestDeployment?.publicUrl || frontendUrl || backendUrl || "";

  return (
    <article className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl text-sand-100">{project.name}</h3>
          <p className="mt-1 break-all text-sm text-sand-200/70">{project.repoUrl}</p>
        </div>
        <button className="button-primary" disabled={deploying} onClick={() => onDeploy(project.id)}>
          {deploying ? "Queueing..." : "Deploy"}
        </button>
      </div>

      <div className="grid gap-3 text-sm text-sand-200/80 md:grid-cols-3">
        <div className="rounded-md bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-sand-200/55">Type</div>
          <div className="mt-2 text-base text-sand-100">{project.type}</div>
        </div>
        <div className="rounded-md bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-sand-200/55">Branch</div>
          <div className="mt-2 text-base text-sand-100">{project.repoBranch}</div>
        </div>
        <div className="rounded-md bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-sand-200/55">Public URL</div>
          <div className="mt-2 break-all text-base text-sand-100">
            {publicUrl ? (
              <a className="text-sea-300 hover:text-sea-200" href={publicUrl} rel="noreferrer" target="_blank">
                {publicUrl}
              </a>
            ) : (
              "Not deployed yet"
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm uppercase tracking-[0.18em] text-sand-200/60">Recent deployments</h4>
          <span className="text-xs text-sand-200/50">
            {project.assignedResources?.backend?.instanceId
              ? `EC2 ${project.assignedResources.backend.instanceId}`
              : project.assignedResources?.frontend?.bucketName
                ? `S3 ${project.assignedResources.frontend.bucketName}`
                : "Resources pending"}
          </span>
        </div>
        <div className="space-y-2">
          {project.deploymentHistory.length ? (
            project.deploymentHistory.map((deployment) => (
              <button
                className="flex w-full items-center justify-between rounded-md border border-white/10 bg-ink-900/50 px-3 py-3 text-left transition hover:border-sea-400/50 hover:bg-ink-900"
                key={deployment.id}
                onClick={() => onSelectDeployment(deployment.id)}
              >
                <div>
                  <div className="font-medium text-sand-100">{deployment.triggerSource} deploy</div>
                  <div className="text-xs text-sand-200/60">
                    {new Date(deployment.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={clsx("status-pill", statusClasses[deployment.status])}>
                  {deployment.status}
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-sand-200/55">
              No deployments queued yet.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
