# Deploy Platform

Minimal Render/Vercel/Railway-style deployment platform in a monorepo. Users can sign up, save AWS credentials, register GitHub repositories, queue deployments, and watch logs as BullMQ workers deploy frontend apps to `S3 + CloudFront` or backend apps to `EC2` using the AWS CLI only.

## Folder structure

```text
.
|-- backend
|   |-- src
|   |   |-- config
|   |   |-- controllers
|   |   |-- middleware
|   |   |-- models
|   |   |-- queues
|   |   |-- routes
|   |   |-- services
|   |   `-- utils
|   `-- package.json
|-- frontend
|   |-- public
|   |-- src
|   |   |-- api
|   |   |-- components
|   |   |-- context
|   |   |-- hooks
|   |   `-- pages
|   `-- package.json
|-- scripts
|   |-- deploy-backend.ps1
|   `-- deploy-frontend.ps1
|-- worker
|   |-- src
|   |   |-- config
|   |   |-- models
|   |   |-- services
|   |   `-- utils
|   `-- package.json
|-- docker-compose.yml
`-- package.json
```

## What it does

- `backend`: Express API with JWT auth, MongoDB models, encrypted AWS credential storage, project CRUD, deployment queueing, webhook redeploys, and log APIs.
- `worker`: BullMQ worker that clones repositories, detects frontend vs backend apps, writes `.env`, runs AWS CLI deployment scripts, and streams logs into MongoDB.
- `frontend`: React + Vite + Tailwind dashboard for signup/login, saving AWS credentials, creating projects, triggering deploys, and tailing deployment logs.
- `scripts`: PowerShell deployment scripts. No AWS SDK is used anywhere.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose
- Git
- PowerShell available to the worker
  - Windows: `powershell.exe` works out of the box
  - Linux/macOS: install `pwsh` or set `POWERSHELL_BIN`
- AWS CLI v2
- SSH + SCP available in the environment where the worker runs

## Environment variables

### Backend: `backend/.env`

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/deploy-platform
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace-me
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:5173
GITHUB_WEBHOOK_SECRET=
```

### Worker: `worker/.env`

```env
MONGODB_URI=mongodb://127.0.0.1:27017/deploy-platform
REDIS_URL=redis://127.0.0.1:6379
ENCRYPTION_KEY=replace-with-a-long-random-secret
POWERSHELL_BIN=powershell.exe
WORKER_TMP_DIR=./tmp
SCRIPTS_DIR=../scripts
DEFAULT_BACKEND_PORT=3000
BACKEND_AMI_ID=
```

### Frontend: `frontend/.env`

```env
VITE_API_URL=http://localhost:4000
```

Use the same `ENCRYPTION_KEY` in backend and worker so encrypted AWS credentials and private keys can be decrypted during deployment.
If your AWS user cannot call `ssm:GetParameter`, set `BACKEND_AMI_ID` in `worker/.env` to a valid Ubuntu AMI for your target region.

## Setup

1. Start infrastructure:

```bash
docker-compose up -d
```

2. Install all workspace dependencies from the repo root:

```bash
npm install
```

3. Copy env files:

```bash
cp backend/.env.example backend/.env
cp worker/.env.example worker/.env
cp frontend/.env.example frontend/.env
```

4. Start the monorepo in development mode:

```bash
npm run dev
```

Services:

- Backend API: `http://localhost:4000`
- Frontend dashboard: `http://localhost:5173`
- MongoDB: `mongodb://127.0.0.1:27017/deploy-platform`
- Redis: `redis://127.0.0.1:6379`

## Backend API overview

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

### User

- `PUT /api/users/aws-credentials`

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/:projectId`
- `POST /api/projects/:projectId/deploy`

### Deployments

- `GET /api/deployments/:deploymentId/logs`

### GitHub webhook

- `POST /webhook`
- `POST /webhook/github`

On a GitHub `push` event the backend normalizes the repository URL, finds the matching project, and queues a redeploy. Frontend redeploys reuse the same S3 bucket and CloudFront distribution. Backend redeploys reuse the same EC2 instance and stored key pair.

## Deployment behavior

### Frontend flow

1. Worker clones the repo.
2. Detects a frontend app using `vite.config.*`, `next.config.*`, or `react` dependencies.
3. Writes `.env`.
4. Runs `scripts/deploy-frontend.ps1`.
5. Script runs `npm install`, `npm run build`, creates or reuses an S3 bucket, uploads artifacts, creates or reuses a CloudFront distribution, then returns the public URL.

### Backend flow

1. Worker clones the repo.
2. Detects a backend app using `express` or `fastify` dependencies.
3. Writes `.env`.
4. Runs `scripts/deploy-backend.ps1`.
5. Script creates or reuses an EC2 instance, creates or reuses the SSH key pair, copies source code and `.env` via `scp`, installs dependencies remotely, and starts the service with `pm2`.

## Security notes

- AWS credentials are encrypted in MongoDB with AES-256-GCM.
- Backend project key pairs are encrypted before being saved.
- AWS credentials are injected into each worker job dynamically through environment variables.
- No AWS credentials are hardcoded in source files.
- GitHub webhook signature validation is supported with `GITHUB_WEBHOOK_SECRET`.

## Assumptions

- Repositories are cloneable from the worker environment.
- Frontend deployments target static builds with output in `dist`, `build`, or `out`.
- Backend projects expose a `start` script in `package.json`. If missing, the worker falls back to `node index.js`.
- The EC2 deployment script installs Node.js and `pm2` on Ubuntu instances.

## Running each service separately

```bash
npm run dev:backend
npm run dev:worker
npm run dev:frontend
```

## Production-style notes

- This is intentionally minimal, but the repo is structured so you can extend it with refresh tokens, GitHub OAuth, secret rotation, SSE log streaming, custom domains, or Docker-based remote deploy strategies.
- The worker uses BullMQ concurrency and stores deployment logs in MongoDB so the frontend can poll them live.
- `docker-compose.yml` brings up only Redis and MongoDB, which keeps local app iteration fast while preserving the expected infrastructure layout.
