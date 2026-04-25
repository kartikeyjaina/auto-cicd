import { Link } from "react-router-dom";

export default function AuthCard({
  title,
  subtitle,
  submitLabel,
  footerText,
  footerLink,
  footerLabel,
  onSubmit,
  form,
  setForm,
  loading,
  error,
  fields
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="flex min-h-[520px] flex-col justify-between rounded-[28px] border border-white/10 bg-ink-900/70 p-8 shadow-glow">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.25em] text-sea-300">Deploy Platform</p>
            <h1 className="max-w-xl font-display text-5xl leading-tight text-sand-100">
              Ship GitHub repos to AWS without leaving the dashboard.
            </h1>
            <p className="max-w-lg text-base leading-7 text-sand-200/80">
              Manual deploys, webhook redeploys, encrypted credentials, and live worker logs in a
              single control plane.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="panel p-4">
              <div className="text-2xl font-semibold text-sea-300">S3 + CDN</div>
              <div className="mt-1 text-sm text-sand-200/70">Static frontend delivery</div>
            </div>
            <div className="panel p-4">
              <div className="text-2xl font-semibold text-sea-300">EC2</div>
              <div className="mt-1 text-sm text-sand-200/70">Reusable backend hosts</div>
            </div>
            <div className="panel p-4">
              <div className="text-2xl font-semibold text-sea-300">BullMQ</div>
              <div className="mt-1 text-sm text-sand-200/70">Queue-backed deployments</div>
            </div>
          </div>
        </section>

        <section className="panel flex items-center p-8">
          <form className="w-full space-y-5" onSubmit={onSubmit}>
            <div>
              <h2 className="font-display text-3xl text-sand-100">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-sand-200/70">{subtitle}</p>
            </div>

            <div className="space-y-4">
              {fields.map((field) => (
                <label className="block space-y-2" key={field.name}>
                  <span className="text-sm text-sand-200/80">{field.label}</span>
                  <input
                    className="input"
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.name]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    required={field.required !== false}
                  />
                </label>
              ))}
            </div>

            {error ? (
              <div className="rounded-md border border-coral-400/30 bg-coral-400/10 px-3 py-2 text-sm text-coral-400">
                {error}
              </div>
            ) : null}

            <button className="button-primary w-full" disabled={loading} type="submit">
              {loading ? "Working..." : submitLabel}
            </button>

            <p className="text-sm text-sand-200/70">
              {footerText}{" "}
              <Link className="text-sea-300 hover:text-sea-200" to={footerLink}>
                {footerLabel}
              </Link>
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
