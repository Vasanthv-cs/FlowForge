# FlowForge Workflow Templates Guide

FlowForge Workflow Templates provide reusable, pre-configured automation patterns that enable users to jumpstart workflow design, adopt proven integration topologies, and standardize automation practices across workspaces.

---

## 1. Overview & Architecture

Templates in FlowForge exist in two tiers:

1. **System Starter Templates**: Built-in, read-only templates curated by FlowForge to showcase best-practice patterns (Manual triggers, HTTP integrations, Scheduled pollers, Webhooks, and Resilient error handling).
2. **Private Workspace Templates**: Custom workflow blueprints created by workspace developers and admins, stored securely in PostgreSQL with row-level security (RLS) and workspace isolation.

```
+-----------------------------------------------------------------------------------+
|                              Templates System                                     |
+------------------------------------+----------------------------------------------+
|       Built-in Starter Library      |        Private Workspace Templates           |
|  - In-memory curated templates     |  - Saved from existing workflows             |
|  - Read-only, immutable            |  - Workspace scoped (PostgreSQL + RLS)       |
|  - Free of hardcoded credentials   |  - Developer/Admin write; Viewer read-only   |
+------------------------------------+----------------------------------------------+
                                      |
                                      v
                       [ Template Instantiation Engine ]
               - Generates fresh, unique node & edge IDs
               - Preserves full graph topology and configurations
               - Leaves original template immutable
                                      |
                                      v
                       [ Active Workflow Canvas / Studio ]
```

---

## 2. Built-in Starter Templates

FlowForge ships with five production-tested starter templates:

### 1. Manual Trigger -> Transform Data -> Console Output
- **Category**: `general`
- **Use Case**: Quick debugging, data mapping exploration, and sanity testing.
- **Node Topology**:
  - `Manual Trigger`: Manual execution trigger button.
  - `Set Data`: Initializes sample user and transaction records.
  - `Console Output`: Displays formatted log output in the bottom execution drawer.

### 2. HTTP Request -> Condition -> Alert Notification
- **Category**: `integration`
- **Use Case**: API health monitoring, external status polling, and alerting.
- **Node Topology**:
  - `Manual Trigger`: Initial runner.
  - `HTTP Request`: Fetches endpoint status with SSRF protection.
  - `Condition`: Evaluates `{{steps.http.status}} == 200`.
  - Branch A (`Console Output`): Logs normal operation status.
  - Branch B (`Console Output`): Alerts on elevated error rates.

### 3. Scheduled Poller & Health Check
- **Category**: `automation`
- **Use Case**: Periodic system monitoring running automatically on a cron cadence.
- **Node Topology**:
  - `Schedule Trigger`: Configured for recurring executions (`*/15 * * * *`).
  - `HTTP Request`: Pings external services with timeout and retry handling.
  - `Condition`: Validates service availability.
  - `Console Output`: Logs health check summary.

### 4. Webhook Ingestion & Lead Validation
- **Category**: `data`
- **Use Case**: Ingesting incoming HTTP POST webhooks, validating required fields, and generating responses.
- **Node Topology**:
  - `Webhook Trigger`: Ingests JSON payload with signature authentication.
  - `Condition`: Validates payload schema (e.g. `payload.email` exists).
  - `Set Data`: Normalizes lead attributes.
  - `Webhook Response`: Returns `200 OK` or `400 Bad Request` to the caller.

### 5. Resilient API Pipeline with Fallback
- **Category**: `error-handling`
- **Use Case**: Mission-critical operations requiring robust fallback upon upstream degradation.
- **Node Topology**:
  - `Manual Trigger`: Pipeline entry point.
  - `HTTP Request (Primary)`: Configured with exponential retry policy.
  - `Condition`: Evaluates execution success.
  - `HTTP Request (Secondary/Fallback)`: Calls secondary fallback provider on failure.
  - `Console Output`: Reports final resolution status.

---

## 3. Template Validation & Quality Assurance

All templates must pass strict automated validation before instantiation or persistence:

- **Schema Conformance**: Validates structure against `workflowTemplateSchema` via Zod.
- **DAG Acyclicity**: Validates directed acyclic graph topology using topological sorting (Kahn's algorithm). Cycles are strictly rejected.
- **Supported Node Types**: Every node must belong to `KNOWN_NODE_TYPES`. Arbitrary, unverified node types are blocked.
- **Trigger Requirement**: A valid template must include at least one valid trigger node (`category: 'trigger'`).
- **Credential Leak Prevention**: Regex scanners inspect node configurations to prevent saving hardcoded secret tokens (e.g., live production API keys, raw JWTs, or passwords). Templates must instead use `{{env.VAR_NAME}}` or the Credential Vault.

---

## 4. Instantiation Workflow

When a user creates a workflow from a template:

1. **ID Remapping**: The instantiation engine assigns new random UUIDs to all nodes and edges to avoid collisions with any existing workflow elements.
2. **Topology Preservation**: Edge connections (`source`, `target`, `sourceHandle`, `targetHandle`) are dynamically re-mapped to the newly generated node UUIDs.
3. **Canvas Loading**: The workflow state is initialized directly in the editor canvas, dirty state is tracked, and execution history starts cleanly.
4. **Immediate Customization**: Users can alter configs, re-wire branches, or inject credentials without affecting the template.

---

## 5. Saving Private Workspace Templates

Users with `developer`, `admin`, or `owner` workspace roles can save any active workflow as a private workspace template:

1. In the TopNav bar, click **Templates**.
2. Select the **Save Current as Template** tab.
3. Provide a descriptive title, category, description, and preview icon.
4. Click **Save Workspace Template**.
5. The template is immediately accessible to all workspace members in the template browser.
