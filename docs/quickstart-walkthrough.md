# FlowForge — 5-Minute Quickstart & Evaluation Walkthrough

Welcome to FlowForge! This guide is designed for developers, evaluators, and interviewers who want to test the entire platform from zero to running workflows in under 5 minutes.

---

## 🚀 Prerequisites & Installation

### 1. Requirements
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- A modern web browser (Chrome, Firefox, Safari, Edge)

### 2. Setup
```bash
# 1. Clone the repository
git clone https://github.com/your-username/flowforge.git
cd flowforge

# 2. Install dependencies
npm install

# 3. Configure local environment variables
cp .env.example .env.local
```

### 3. Launch the Application
Run both the Fastify backend API and the Vite frontend studio:

In **Terminal 1** (Backend Server & Durable Worker):
```bash
npm run server
# Starts Fastify on http://127.0.0.1:3001 with worker pool and cron scheduler
```

In **Terminal 2** (Frontend Studio):
```bash
npm run dev
# Starts Vite studio on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🎯 Hands-On Guided Walkthrough (5 Key Scenarios)

### Scenario 1: Explore & Run a Pre-Built Workflow
1. Open FlowForge in your browser.
2. In the top navigation bar, click the **"Templates"** button.
3. Select **"GitHub Release & Team Notifier"** or **"Multi-Step Data Extraction & Enrichment"** and click **"Use Template"**.
4. The workflow canvas will populate with connected nodes:
   - `Manual Trigger` $\to$ `HTTP Request` $\to$ `Condition` $\to$ `Transform Data` $\to$ `Console Output`.
5. Click the green **"Run Workflow"** button in the top navigation bar.
6. Watch the canvas execute in real time:
   - Nodes transition from `Grey` (ready) $\to$ `Blue` (running spinner) $\to$ `Green` (completed).
7. Click any node (e.g. `Transform Data`) to open the **Node Inspector** on the right and inspect its exact received input and emitted output payloads.

---

### Scenario 2: Test Lab & Automated Scenario Validation
1. In the top navigation bar, click **"Test Lab"**.
2. Notice the pre-configured test scenarios with custom input payloads.
3. Click **"Run Suite"**:
   - The test engine runs Kahn’s DAG validator, executes the graph with the scenario payload, and checks the configured assertions (e.g. `status equals 200`, `output contains "success"`).
4. Inspect the pass/fail indicators, execution durations, and output diffs.

---

### Scenario 3: Time-Travel Debugging & Workflow Replay
1. Intentionally trigger a workflow failure (e.g., set an HTTP Request node URL to `https://httpstat.us/500`).
2. Click **"Run Workflow"**. The HTTP Request node turns **Red** (failed).
3. In the bottom drawer, switch to the **"Past Runs"** or **"Timeline"** tab.
4. Click on the failed execution to open the execution details.
5. In the timeline, find the failed node and click **"Replay from Here"**.
6. The Replay Modal displays the captured upstream state snapshot. Correct the node configuration (or update the mock input) and click **"Confirm Replay"**.
7. The engine re-executes the workflow starting strictly from that node forward without re-running earlier steps.

---

### Scenario 4: Secure Secrets with the Credential Vault
1. In the top navigation bar, click **"Credentials"**.
2. Click **"+ Add Credential"**:
   - **Key Name**: `STRIPE_API_KEY`
   - **Secret Value**: `sample_stripe_secret_key_123`
   - **Type**: `API Key`
3. Click **"Save Credential"**.
4. The secret is immediately encrypted at rest using **AES-256-GCM**; the plaintext value is never returned to the UI or stored in plaintext.
5. Go back to any `HTTP Request` node on the canvas:
   - In the headers section, enter: `Authorization: Bearer {{vault.STRIPE_API_KEY}}`.
   - FlowForge will securely resolve and inject this secret inside backend worker memory at runtime while automatically scrubbing it from all logs and execution timelines.

---

### Scenario 5: Operational Monitoring & Health Probes
1. In the top navigation bar, click **"Monitoring"**.
2. The **Monitoring Dashboard** opens displaying:
   - **Infrastructure Health**: Database connectivity & round-trip latency (e.g., 8ms), active worker capacity, queue depth, and scheduler status.
   - **Execution KPIs**: Total volume, success rate, failure rate, and retry rate.
   - **Duration Percentiles**: Visual breakdown of `avg`, `min`, `max`, `p50`, `p90`, and `p95` execution latencies.
   - **Volume History**: Interactive time-series chart showing throughput vs. failures.
   - **Node Failure Breakdown**: Real-time breakdown of which node types produce the most failures.
3. Try changing the time window (`1h`, `24h`, `7d`) or enabling the **"Auto-refresh: 10s"** toggle.

---

## 💻 Exploring the Developer CLI (`flowforge`)

FlowForge includes a full-featured CLI for CI/CD pipelines and terminal workflows:

```bash
# 1. View all CLI commands and options
npm run cli -- --help

# 2. Validate a workflow JSON file offline (DAG cycles, schemas, secrets)
npm run cli -- workflow validate examples/01_user_onboarding_pipeline.json

# 3. Export a workflow without exposing credentials
npm run cli -- workflow export <workflow-id> --out ./clean-workflow.json

# 4. List cloud workflows in your workspace
npm run cli -- workflow list
```

---

## 🧪 Running the Automated Test Suite

FlowForge enforces a strict zero-regression testing standard with **353 tests across 26 test suites**:

```bash
# Run the complete test suite (unit, integration, durable workers, SSRF, RBAC)
npm test

# Run code style and lint checks
npm run lint

# Run strict TypeScript compilation
npx tsc --noEmit

# Run production bundle build
npm run build
```

---

## 🔍 Verification Checklist for Evaluators

| Feature | Verified Location | Status |
| :--- | :--- | :---: |
| **Canvas & DAG Engine** | `src/engine/`, `packages/workflow-core/` | ✅ Verified |
| **Durable Execution & Retries** | `src/server/services/durableWorkerService.ts` | ✅ Verified |
| **SSRF & DNS Security Shield** | `src/server/http/safeHttpClient.ts` | ✅ Verified |
| **AES-256-GCM Credential Vault**| `src/server/crypto/encryption.ts` | ✅ Verified |
| **Time-Travel Replay Engine** | `packages/workflow-core/src/replay.ts` | ✅ Verified |
| **Advanced Testing Lab** | `src/components/testLab/TestLabModal.tsx` | ✅ Verified |
| **Developer CLI (`flowforge`)** | `packages/cli/src/index.ts` | ✅ Verified |
| **Monitoring & Health Probes** | `src/server/routes/health.ts`, `src/components/monitoring/` | ✅ Verified |
| **Full Automated Tests** | `npm test` (353 passed / 353 total) | ✅ Verified |
