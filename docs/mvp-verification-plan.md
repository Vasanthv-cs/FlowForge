# FlowForge — MVP Verification Plan (Batch 8)

This verification plan defines the testing methodology, manual test scripts, automated test coverage, and known limitations for all 12 critical user journeys in FlowForge.

---

## Journey Matrix & Verification Status

| # | User Journey | Automated Coverage | Manual Test Status | Readiness Assessment |
|---|--------------|-------------------|--------------------|----------------------|
| 1 | Sign Up and Sign In | `authService.test.ts`, `backendApiAndAuth.test.ts` | Verified (Local / Email+Password) | Ready (Google OAuth requires dashboard redirect setup) |
| 2 | Create or Select a Workspace | `workspaceAndRbac.test.ts`, `backendApiAndAuth.test.ts` | Verified | Ready |
| 3 | Create a Workflow | `workflowStore.test.ts`, `cloudWorkflowPersistence.test.ts` | Verified | Ready |
| 4 | Add and Connect Nodes | `connectionValidation.test.ts`, `nodeValidation.test.ts`, Playwright E2E | Verified | Ready |
| 5 | Save and Reopen a Workflow | `cloudWorkflowPersistence.test.ts`, `testLabAndPersistence.test.ts` | Verified | Ready |
| 6 | Execute a Workflow on Backend | `serverWorkflowExecution.test.ts`, `workflowEngine.test.ts` | Verified | Ready (SSRF protected) |
| 7 | View Status & Node Logs | `executionHistoryAndLogs.test.ts`, `serverWorkflowExecution.test.ts` | Verified | Ready |
| 8 | Inspect Execution History | `executionHistoryAndLogs.test.ts`, `backendApiAndAuth.test.ts` | Verified | Ready |
| 9 | Cancel an Execution | `serverWorkflowExecution.test.ts` | Verified | Ready |
| 10| Test Workspace Permissions | `workspaceAndRbac.test.ts`, `backendApiAndAuth.test.ts` | Verified | Ready |
| 11| Workflow Testing Laboratory | `testLabAndPersistence.test.ts` | Verified | Ready (Bug fixed in Batch 8) |
| 12| Sign Out and Sign Back In | `authService.test.ts`, `backendApiAndAuth.test.ts` | Verified | Ready |

---

## 1. Sign Up and Sign In

### Expected Behavior
- Users can create an account with email and password.
- Valid credentials issue a signed Supabase JWT and create a default workspace with `owner` role.
- Session persists in `localStorage` across page reloads.
- Invalid credentials, short passwords, or malformed emails display clear localized validation errors.

### How to Test Manually
1. Open the application at `http://localhost:5173`.
2. Click **Sign In** in the top navigation bar.
3. Switch to the **Sign Up** tab.
4. Enter test email `test-owner@flowforge.dev` and password `Password123!`.
5. Click **Create Account**. Ensure you are redirected to the studio and your workspace displays "Default Workspace".
6. Refresh the browser page (`F5`) and confirm that the user remains authenticated.

### Relevant Automated Tests
- `src/__tests__/authService.test.ts`: Tests sign-up, sign-in, token refresh, and sign-out.
- `src/__tests__/backendApiAndAuth.test.ts`: Verifies Fastify JWT validation middleware and rejection of missing/forged tokens.

### Known Limitations
- Google OAuth requires configuring the exact redirect URL (`https://<project-id>.supabase.co/auth/v1/callback` and `http://localhost:5173`) in Google Cloud Console and Supabase Dashboard. If not configured, Supabase returns provider errors.

---

## 2. Create or Select a Workspace

### Expected Behavior
- Authenticated users can list all workspaces they are a member of.
- Users can switch active workspaces from the top-left dropdown.
- Creating a workspace automatically provisions the user as the `owner` with full administrative privileges.
- Switching workspaces updates the workflow document cache to the newly selected workspace.

### How to Test Manually
1. Click the workspace selector in the top-left header.
2. Click **Create Workspace** and enter `"Engineering Operations"`.
3. Confirm that the studio switches to the new workspace with zero workflows.
4. Switch back to `"Default Workspace"` and verify that the previously active workflow remains intact.

### Relevant Automated Tests
- `src/__tests__/workspaceAndRbac.test.ts`: Validates workspace creation, membership retrieval, and role assignments.
- `src/__tests__/backendApiAndAuth.test.ts`: Validates that users cannot access resources across workspace boundaries (`404` or `403`).

### Known Limitations
- Deleting a workspace requires removing child workflows and execution logs first.

---

## 3. Create a Workflow

### Expected Behavior
- Clicking **New Workflow** generates a new workflow document with a fresh UUID and resets canvas nodes/edges.
- Unsaved changes in an existing workflow prompt for confirmation or auto-save.
- The document starts with an editable name and default metadata.

### How to Test Manually
1. Click **New Workflow** in the top navigation bar.
2. The canvas clears and displays an empty grid.
3. Double-click the workflow title in the header and rename it to `"Payment Verification Pipeline"`.
4. Observe the **Unsaved** badge change to **Auto-saving...** and then **Saved**.

### Relevant Automated Tests
- `src/__tests__/workflowStore.test.ts`: Validates workflow initialization, renaming, and document dirty flags.
- `src/__tests__/cloudWorkflowPersistence.test.ts`: Tests workflow document creation and indexing.

### Known Limitations
- Offline drafts are cached in IndexedDB; if browser cookies/storage are cleared, un-synced offline drafts are lost.

---

## 4. Add and Connect Nodes

### Expected Behavior
- Dragging nodes from the left library onto the canvas renders them with accurate ports.
- Only valid port connections are permitted:
  - Source output (`any` / `object`) to target input (`any` / `object`).
  - Condition node exposes `true` and `false` handles.
  - Cycle detection prevents circular dependencies.
- Connecting ports creates an animated edge (`smoothstep`).

### How to Test Manually
1. Drag **Manual Trigger** to `(100, 100)`.
2. Drag **Condition** to `(350, 100)`.
3. Drag **Console Output** to `(600, 50)` and another to `(600, 200)`.
4. Connect Trigger output to Condition input.
5. Connect Condition `true` handle to the top Console Output.
6. Connect Condition `false` handle to the bottom Console Output.
7. Attempt to connect the Console Output back to Manual Trigger; verify that the engine blocks cycle creation.

### Relevant Automated Tests
- `src/__tests__/connectionValidation.test.ts`: Exhaustively tests connection type compatibility, handle rules, and cycle rejection.
- `src/__tests__/nodeValidation.test.ts`: Tests property schemas and node requirements.
- `e2e/workflow-canvas.spec.ts`: Playwright test verifying drag-and-drop and connection rendering.

### Known Limitations
- Concurrency limit is set to 4 simultaneous nodes per execution to maintain stable browser and Node process memory.

---

## 5. Save and Reopen a Workflow

### Expected Behavior
- Workflows are automatically saved to IndexedDB (local mode) and Supabase (cloud mode).
- Version snapshots can be created with semver tags (e.g. `v1.0.0`) and descriptions.
- Reopening a saved workflow restores all node positions, configuration parameters, and edges.

### How to Test Manually
1. On a populated canvas, click the **Saved** / **Save** button.
2. Click **Versions** in the top bar. Enter version tag `"v1.0.0"` and description `"Initial stable flow"`.
3. Click **Workflows** in the top bar and select a different workflow or click **New Workflow**.
4. Re-open `"Payment Verification Pipeline"` from the Workflows modal.
5. Verify that all nodes, positions, and connections are preserved exactly.

### Relevant Automated Tests
- `src/__tests__/cloudWorkflowPersistence.test.ts`: Tests cloud save, local fallback, and conflict handling.
- `src/__tests__/testLabAndPersistence.test.ts`: Tests IndexedDB persistence and version history snapshots.

### Known Limitations
- When offline or unauthenticated, saving persists exclusively to IndexedDB until cloud synchronization is restored.

---

## 6. Execute a Workflow on the Backend

### Expected Behavior
- Authorized users (Owner, Admin, Developer) can trigger server-side execution via `POST /api/workspaces/:workspaceId/workflows/:workflowId/execute`.
- Viewers are rejected with `403 Forbidden`.
- Execution evaluates the DAG order using topological sort.
- SSRF protection enforces DNS pinning, disallowing private IP ranges (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `192.168.0.0/16`, etc.).

### How to Test Manually
1. Open a workflow containing **Manual Trigger** (`{ "orderAmount": 250 }`) connected to **Condition** (`payload.orderAmount > 100`).
2. Click **Run** in the top navigation bar.
3. Observe real-time node badges: Trigger turns green, Condition turns green, True branch turns green, False branch turns gray (`skipped`).
4. Replace URL in an HTTP Request node with `http://169.254.169.254/latest/meta-data/` and click Run.
5. Verify that the node fails immediately with an SSRF security error (`Disallowed private IP address`).

### Relevant Automated Tests
- `src/__tests__/serverWorkflowExecution.test.ts`: Tests authentication, RBAC, DAG execution, snapshotting, and cycle validation.
- `src/__tests__/ssrfProtection.test.ts`: 28 unit tests covering DNS rebinding, private CIDRs, streaming response limits, and redirects.

### Known Limitations
- HTTP request execution has a default 10-second timeout and 5MB payload size limit.

---

## 7. View Execution Status and Node Logs

### Expected Behavior
- Execution outputs are streamed or polled into the bottom panel.
- Each node record captures:
  - `status`: `'pending' | 'running' | 'success' | 'failed' | 'skipped'`
  - `durationMs`: Wall-clock execution time.
  - `inputData` and `outputData`: Redacted payloads.
  - Node-level logs with timestamps and log levels (`info`, `warn`, `error`).

### How to Test Manually
1. Run a workflow.
2. In the bottom panel, click **Execution Logs**.
3. Verify that logs display timestamped entries for each node.
4. Click **Timeline** to view the execution Gantt chart showing node start and completion times.

### Relevant Automated Tests
- `src/__tests__/executionHistoryAndLogs.test.ts`: Tests log emission, node status updates, and timeline serialization.

### Known Limitations
- In-browser execution logs are retained up to 100 entries in memory per session.

---

## 8. Inspect Execution History

### Expected Behavior
- Every execution run creates an immutable record in `execution_history`.
- Users can view past runs, filter by status (`success`, `failed`, `cancelled`, `interrupted`), and inspect previous snapshots.

### How to Test Manually
1. Execute a workflow 3 times with different inputs.
2. In the bottom panel, click **Past Runs**.
3. Verify that all 3 runs are listed with their respective status badges, start times, and durations.
4. Click on a past run to view its node-level execution details.

### Relevant Automated Tests
- `src/__tests__/executionHistoryAndLogs.test.ts`: Verifies past run querying, filtering, and detail extraction.
- `src/__tests__/backendApiAndAuth.test.ts`: Verifies `GET /api/workspaces/:workspaceId/executions`.

### Known Limitations
- Large executions with high payload volume prune node output fields larger than 256KB to preserve database performance.

---

## 9. Cancel an Execution

### Expected Behavior
- While a workflow is actively running (e.g. long Delay or slow HTTP request), users can click **Cancel**.
- The Fastify backend terminates active node processes via `AbortController`.
- The execution status updates immediately to `'cancelled'`.
- Interrupted processes upon server restart are reconciled to `'interrupted'`.

### How to Test Manually
1. Add a **Delay** node configured for `10000ms` (10 seconds).
2. Click **Run**.
3. While the delay node is glowing amber (`running`), click the red **Stop / Cancel** button in the header.
4. Verify that execution ceases immediately and status transitions to **Cancelled**.

### Relevant Automated Tests
- `src/__tests__/serverWorkflowExecution.test.ts`: Tests cancellation endpoint authorization, abort signaling, and status transitions.
- `src/__tests__/productionHardeningAndSmoke.test.ts`: Tests stale execution reconciliation to `'interrupted'`.

### Known Limitations
- Browser-only executions can only be cancelled while the tab remains open.

---

## 10. Test Workspace Permissions (RBAC)

### Expected Behavior
- `owner` / `admin`: Can create, edit, execute, and delete workflows; manage workspace members.
- `developer`: Can create, edit, execute workflows; cannot modify workspace settings or delete workspaces.
- `viewer`: Can only read workflows and inspect execution logs; all POST/PUT/DELETE endpoints return `403 Forbidden`.

### How to Test Manually
1. Log in as an `owner` user.
2. In Workspace Settings, invite `colleague@flowforge.dev` with role `viewer`.
3. In an incognito window, log in as `colleague@flowforge.dev`.
4. Open the workflow. Note that edit handles, delete buttons, and the **Run** button are disabled or return `403`.
5. Attempt an execution API call using curl:
   ```bash
   curl -X POST http://localhost:3000/api/workspaces/<id>/workflows/<id>/execute \
     -H "Authorization: Bearer <viewer-token>"
   ```
   Verify HTTP status `403 Forbidden` with `"Viewer role cannot execute workflows"`.

### Relevant Automated Tests
- `src/__tests__/workspaceAndRbac.test.ts`: Tests full matrix of permissions across owner, admin, developer, and viewer roles.
- `src/__tests__/backendApiAndAuth.test.ts`: Tests route-level authorization guards.

### Known Limitations
- Custom granular roles (e.g., custom IAM policies) are not supported in MVP; only the 4 standard tiers are available.

---

## 11. Workflow Testing Laboratory

### Expected Behavior
- Users can create, edit, and persist automated test scenarios.
- The sample trigger input JSON editor allows free typing and pasting with real-time JSON syntax validation.
- Target node dropdown lists valid canvas nodes with human-readable labels.
- Stale or obsolete target node references automatically reconcile to existing workflow nodes.
- Assertions accurately evaluate string, boolean (`_condition.branch === false`), numeric, and existence operators.
- Failed assertions report explicit actual vs. expected discrepancies.

### How to Test Manually
1. Open a workflow with a Condition node.
2. Click **🧪 Test Lab** in the top navigation.
3. Select **Suspended / Inactive User Handling**.
4. Verify the target node dropdown displays **Condition**.
5. Edit the Trigger JSON to `{ "orderAmount": 45 }` and set assertion to `_condition.branch == false`.
6. Click **Run Scenario**; verify that it passes.
7. Change expected value to `true` and click **Run Scenario**; verify that it cleanly fails and reports `Expected true, but got false`.

### Relevant Automated Tests
- `src/__tests__/testLabAndPersistence.test.ts`: 14 tests covering JSON parsing, node reconciliation, boolean equality, dot-notation resolution, and missing property handling.

### Known Limitations
- Test scenarios run in an isolated simulation engine; they do not invoke external outbound HTTP network requests during unit assertion passes.

---

## 12. Sign Out and Sign Back In

### Expected Behavior
- Clicking **Sign Out** clears the Supabase session, removes tokens from `localStorage`, and resets memory state.
- Unauthenticated users cannot view private workspace workflows.
- Signing back in restores the user's workspaces and previous session.

### How to Test Manually
1. Click the User Profile menu in the top right.
2. Click **Sign Out**.
3. Verify that the UI displays the guest / signed-out view with **Sign In** button.
4. Refresh the page to ensure tokens were completely purged.
5. Sign back in with valid credentials and verify immediate access to your workspace.

### Relevant Automated Tests
- `src/__tests__/authService.test.ts`: Validates complete token invalidation on sign-out.
- `src/__tests__/backendApiAndAuth.test.ts`: Verifies that subsequent API calls with purged tokens receive `401 Unauthorized`.

### Known Limitations
- Session tokens expire according to Supabase JWT expiration (default: 3600 seconds / 1 hour); client automatically refreshes tokens via refresh token if active.
