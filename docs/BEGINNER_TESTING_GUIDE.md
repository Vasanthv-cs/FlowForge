# FlowForge Beginner Testing & Maintenance Guide

Welcome to the beginner testing guide for FlowForge! This document is designed for project owners, engineers, and maintainers to run, test, understand, and verify FlowForge locally from scratch.

---

## 1. Quick Start: Running FlowForge Locally

FlowForge consists of two processes running concurrently:
1. **The Fastify Backend API** (runs on `http://localhost:3001`)
2. **The React/Vite Frontend** (runs on `http://localhost:5173`)

### Terminal Commands to Run

Open **two terminal windows** in your project root folder (`flow/`):

#### Terminal 1 — Start the Backend Server:
```bash
npm run server:dev
```
*What this does:* Starts the Fastify backend server in watch mode using `tsx`. If you make changes to backend files, it will automatically restart. You should see:
```
🚀 FlowForge Backend API running on http://127.0.0.1:3001
```

#### Terminal 2 — Start the Frontend Canvas:
```bash
npm run dev
```
*What this does:* Starts the Vite development web server. It compiles your React components and opens a hot-reloading dev server at:
```
➜  Local:   http://localhost:5173/
```

Now open `http://localhost:5173` in your browser.

---

## 2. Environment Variables Configuration

FlowForge uses environment variables to communicate with your Supabase cloud project.

Create a file named `.env.local` in the project root by copying `.env.example`:

```bash
# Windows PowerShell:
Copy-Item .env.example .env.local
```

### Required Variables in `.env.local`

```env
# ------------------------------------------------------------------------------
# 1. FRONTEND CONFIGURATION (Vite Client Bundle)
# ------------------------------------------------------------------------------
# Public credentials (safe for the browser)
VITE_SUPABASE_URL=https://rnkaowxaaxdzumliicku.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-anon-key
VITE_API_URL=http://localhost:3001

# ------------------------------------------------------------------------------
# 2. BACKEND CONFIGURATION (Fastify Server Only)
# ------------------------------------------------------------------------------
# Internal server settings
PORT=3001
HOST=127.0.0.1
NODE_ENV=development

# Supabase Server Connectivity
SUPABASE_URL=https://rnkaowxaaxdzumliicku.supabase.co
SUPABASE_ANON_KEY=your-supabase-publishable-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-server-only

# Security & CORS
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_MAX=100
ENFORCE_HTTPS=false
```

> [!IMPORTANT]
> - `SUPABASE_SERVICE_ROLE_KEY` is **confidential**. It gives administrative rights to the database. Never prefix it with `VITE_` and never share it publicly.
> - `.env.local` is listed in `.gitignore` so Git will never accidentally commit your keys.

---

## 3. Creating a Test User Account

FlowForge requires an authenticated user to create workspaces, save cloud workflows, and run server-side executions.

1. Open `http://localhost:5173` in your browser.
2. In the top navigation bar, click the **Sign In** button.
3. An authentication modal will appear. Click the tab: **"Need an account? Sign up"**.
4. Enter a test email (e.g. `tester@example.com`) and a password (at least 6 characters).
5. Click **Sign Up**.
6. Depending on your Supabase project settings:
   - If email confirmation is disabled: you are logged in immediately.
   - If email confirmation is enabled: check your email inbox (or Supabase dashboard > Authentication > Users) and confirm your email.
7. Once logged in, your user avatar and active workspace selector will appear in the top-left navigation.

---

## 4. Creating Your First Workflow: Step-by-Step

Let's build a real pipeline: **Manual Trigger → Transform Data → Console Output**.

### Step A: Add the Nodes to the Canvas
1. On the left sidebar, ensure the **"Nodes"** tab is selected.
2. Find **"Manual Trigger"** (under Triggers). Click and drag it onto the left side of the canvas.
3. Find **"Transform Data"** (under Data). Click and drag it onto the middle of the canvas.
4. Find **"Console Output"** (under Utility). Click and drag it onto the right side of the canvas.

### Step B: Connect the Nodes (Draw Edges)
1. On the right edge of the **Manual Trigger** node, you will see a small circular handle. Click and drag a line to the left handle of the **Transform Data** node.
2. From the right handle of the **Transform Data** node, click and drag a line to the left handle of the **Console Output** node.
3. You now have a connected, 3-node linear pipeline!

### Step C: Configure the Nodes
1. **Configure Manual Trigger:**
   - Click the **Manual Trigger** node. The right sidebar will switch to the node inspector.
   - In the **Initial Payload (JSON)** field, paste:
     ```json
     {
       "userName": "Vasanth",
       "role": "Project Owner"
     }
     ```
2. **Configure Transform Data:**
   - Click the **Transform Data** node.
   - **Mode:** Select `property-path`.
   - **Property Path:** Enter `userName`.
   - **Output Key:** Enter `extractedName`.
   *(This tells the node: extract the `userName` field from the incoming data and store it under the key `extractedName`)*.
3. **Configure Console Output:**
   - Click the **Console Output** node.
   - **Log Level:** Select `info`.
   - **Prefix:** Enter `[Welcome Pipeline]`.

### Step D: Name & Save Your Workflow
1. At the top-center of the screen, click on the workflow name (defaults to "Untitled Workflow").
2. Type a new name: `User Greeting Pipeline` and press Enter.
3. Click the **Save** button in the top navigation bar (or press `Ctrl+S`).
4. Notice the badge changes to a green checkmark: **"Saved"**.

### Step E: Run the Workflow
1. Click the **Run** button (with the play icon) in the top navigation bar.
2. Watch the canvas:
   - Node 1 turns blue (running) then emerald green (success).
   - Node 2 executes and turns green.
   - Node 3 executes and turns green.
3. Look at the bottom drawer (**Debugger Logs**):
   - You will see the structured log:
     ```
     [Welcome Pipeline] { "extractedName": "Vasanth" }
     ```

---

## 5. Reopening Workflows & Inspecting History

### Opening a Saved Workflow
1. Click the **Workflows** dropdown in the top navigation bar (or the Workflows tab in the left sidebar).
2. You will see two tabs: **Cloud Workflows** (saved in PostgreSQL) and **Local Workflows** (stored in your browser).
3. Click on any workflow name to instantly load its nodes, connections, and saved positions back onto the canvas.

### Inspecting Execution History
1. In the bottom panel drawer, click the **Execution History** tab.
2. You will see a chronological list of all runs with:
   - Run ID (e.g. `e4a1b8...`)
   - Trigger type (`manual`)
   - Duration (e.g. `24ms`)
   - Status badge (**Success**, **Failed**, **Cancelled**, or **Interrupted**)
3. Click on any run to open its **Detail Inspector**:
   - **Nodes subtab:** Inspect the exact input and output JSON for each individual node.
   - **Events subtab:** View the chronological timeline of when the workflow started, which node executed, and when it finished.
   - **Snapshot subtab:** See the exact frozen JSON graph used during that historical execution.

---

## 6. Testing Workspace Roles & Permissions (RBAC)

FlowForge enforces multi-tenant Role-Based Access Control:

| Workspace Role | Read Workflows | Run Workflows | Edit / Save Workflows |
| :--- | :---: | :---: | :---: |
| **Owner** | Yes | Yes | Yes |
| **Admin** | Yes | Yes | Yes |
| **Developer** | Yes | Yes | Yes |
| **Viewer** | Yes | **NO (403 Forbidden)** | **NO (403 Forbidden)** |

### How to Test Viewer Restrictions:
1. Open Supabase Dashboard > Table Editor > `workspace_members`.
2. Find your test user's membership row and change `role` from `developer` to `viewer`.
3. In FlowForge, click **Run** on a cloud workflow.
4. **Expected Result:**
   - The server rejects the execution with `403 Forbidden`.
   - The debugger log displays: `"Access denied: Viewers have read-only access and cannot modify or execute workflows"`.

---

## 7. Testing SSRF Protection (Security Guard)

FlowForge features a multi-layer defense preventing users from making requests to internal or dangerous IP addresses.

### How to Test the SSRF Gate:
1. Drag an **HTTP Request** node onto the canvas.
2. In its configuration panel, set:
   - **Method:** `GET`
   - **URL:** `http://169.254.169.254/latest/meta-data/` *(AWS/Cloud Metadata Endpoint)*
3. Connect Manual Trigger -> HTTP Request and click **Run**.
4. **Expected Result:**
   - The execution halts immediately.
   - The HTTP Request node turns red.
   - The log states: `"SSRF validation failed: Targeting private or restricted IP address "169.254.169.254" is blocked."`

---

## 8. Automated Testing Commands

You can run automated tests anytime in your terminal to ensure code quality:

| Test Command | What It Verifies |
| :--- | :--- |
| `npm test` | Runs all 186 unit and integration test suites (DAG analysis, SSRF, RBAC, DB). |
| `npm run test:e2e` | Runs Playwright Chromium end-to-end browser tests. |
| `npm run lint` | Checks code formatting and ESLint rules (ensures 0 errors/warnings). |
| `npx tsc --noEmit` | Strict TypeScript compiler check (ensures zero type errors). |
| `npm run smoke-test` | Runs the automated smoke test script against the backend. |

---

## 9. How to Identify and Report a Bug

When something unexpected happens:
1. **Open Browser DevTools:** Press `F12` > click **Console**. Check for red JavaScript errors.
2. **Check Terminal Logs:** Look at the Terminal running `npm run server:dev` to see the backend log output.
3. **Check Network Requests:** In DevTools > **Network** tab, filter by `Fetch/XHR`. Inspect the failing request's Response tab to see the server's error message.
4. **Reporting Format:**
   - **What I did:** (e.g., Connected Node A to Node B, clicked Run)
   - **What I expected:** (e.g., Workflow completes successfully)
   - **What actually happened:** (e.g., Node turned red with error "XYZ")
   - **Console / Terminal Error:** (Paste exact error message)
