# FlowForge — Time-Travel Debugging & Workflow Replay

## Overview

Time-Travel Debugging empowers FlowForge developers and automation operators to inspect past workflow runs, diagnose errors down to individual node inputs and outputs, and replay executions starting from any specific node using recorded upstream data.

When a 20-step workflow fails at step 18 due to a downstream condition error or transient payload issue, you do **not** need to re-run steps 1 through 17. Time-Travel Replay reuses the proven, recorded outputs of steps 1–17, lets you inspect or optionally tweak the input to step 18, and re-executes steps 18–20 fresh.

---

## Key Architecture Principles

### 1. Authoritative Snapshot Execution
Every workflow execution records an immutable snapshot of the workflow definition (nodes, edges, configurations, and version) at the moment it runs. When initiating a replay:
* The replay engine strictly executes against the historical snapshot (`definition`), ensuring replay integrity even if someone edited the workflow canvas afterwards.

### 2. Upstream Reuse & Graph Partitioning
When you select a node to replay from (`targetNodeId`):
1. **Downstream Reachability:** The engine computes the directed acyclic graph (DAG) descendants reachable from `targetNodeId` using breadth-first search (BFS).
2. **Upstream Nodes (`isReused: true`):** All predecessor nodes that completed successfully in the original run are marked as `reused`. Their historical `outputData` is loaded directly into the execution context with zero re-execution overhead (`durationMs: 0`).
3. **Target & Downstream Nodes:** The target node receives the combined upstream outputs (or optional user-provided input overrides), and is queued for fresh execution alongside all its dependent downstream children.

```
[Start Trigger] ──> [Transform Data] ──> [Target Node (Failed)] ──> [Notification Node]
   (REUSED)             (REUSED)            (RE-EXECUTED FRESH)       (RE-EXECUTED FRESH)
```

### 3. Safe Replay Mode (Default: ON)
Accidental side-effects (such as re-charging a customer credit card or sending duplicate customer emails) are a major risk of workflow replays in automation tools.

To eliminate this risk:
* **Safe Replay Mode is enabled by default:** All downstream `http-request` and `webhook-response` nodes are automatically mocked using their recorded historical responses if available. No live external requests are dispatched.
* **Explicit Confirmation for Live Requests:** If an operator needs to dispatch live external calls (for example, to re-try against a fixed third-party API), they must toggle Safe Replay Mode off and explicitly check the confirmation checkbox:
  > *"I confirm that live external requests may execute and contact external services."*
* **SSRF and Credential Protection:** All live requests remain strictly guarded by FlowForge's SSRF protection and Credential Vault access policies.

### 4. Immutable Execution History & Lineage
* The original execution record in the `executions` table is **never modified, deleted, or overwritten**.
* A new execution record is generated with lineage metadata:
  ```json
  {
    "replayedFromExecutionId": "original-run-uuid",
    "replayFromNodeId": "target-node-id",
    "isReplay": true,
    "safeReplay": true,
    "reusedNodeIds": ["node-start", "node-transform"],
    "reexecutedNodeIds": ["node-target", "node-notification"]
  }
  ```
* Timeline events explicitly identify reused nodes (`node_completed` with `reused: true`), so auditors can clearly see what ran fresh and what was reused.

---

## Step-by-Step Operator Guide

### 1. Inspecting Historical Runs
1. Open the workflow in the FlowForge Editor.
2. In the bottom debugger panel, switch to the **Execution History** tab.
3. Filter by status (`Failed`, `Success`, `All`) and select the execution you wish to investigate.

### 2. Inspecting Historical Nodes
1. Click on the **Nodes** subtab.
2. For any node:
   * **Status Badge:** Shows `Success`, `Failed`, `Reused`, `Running`, or `Interrupted`.
   * **Focus Button:** Click the **Focus** button to highlight and locate the node directly on the workflow canvas.
   * **Expand:** Click the node row to view:
     - **Input Payload (Redacted):** The exact incoming JSON data delivered to the node.
     - **Output Payload (Redacted):** The data emitted by the node upon execution.
     - **Configuration Snapshot:** The configuration the node had when this execution was run.
     - **Branch Decision:** For condition nodes, displays whether the `TRUE` or `FALSE` branch was selected.
     - **Error Message & Duration:** Detailed error messages and execution times.

### 3. Replaying from a Selected Node
1. On the node where failure occurred (or any node you want to test from), click the **Replay** button.
2. A **Time-Travel Replay** modal will open:
   * **Reused Upstream:** Summarizes how many predecessor nodes will be reused without running.
   * **Re-executed Nodes:** Shows which nodes will run fresh.
   * **Safe Replay Mode:** Active by default. Toggle off only if you require live HTTP calls to external servers.
   * **Input Override (Optional):** You can edit the incoming JSON payload in the editor to test how the workflow reacts to different data.
3. Click **Start Replay Execution**.
4. FlowForge will dispatch the replay, create a linked execution, and automatically switch the view to monitor the new run.

---

## API Reference

### POST `/api/workspaces/:workspaceId/executions/:executionId/replay`
Initiates a replay execution from the specified node.

* **Authorization:** Bearer JWT (Requires `owner`, `admin`, or `developer` workspace role).
* **Request Body:**
  ```json
  {
    "targetNodeId": "node-target-id",
    "editedInput": { "status": "active" },
    "safeReplay": true,
    "waitForCompletion": false
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "executionId": "new-execution-uuid",
    "status": "running",
    "replayedFromExecutionId": "original-execution-uuid",
    "replayFromNodeId": "node-target-id",
    "reusedNodeIds": ["node-1", "node-2"],
    "reexecutedNodeIds": ["node-target-id", "node-3"],
    "safeReplay": true,
    "startedAt": "2026-11-24T14:40:00.000Z"
  }
  ```

---

## Manual Verification Checklist

- [x] **Upstream Reuse:** Verify that predecessor nodes show the `REUSED` badge and `duration: 0ms`.
- [x] **Downstream Execution:** Verify that target and downstream nodes execute freshly.
- [x] **Safe Mode Default:** Verify that external HTTP requests are mocked with recorded output by default.
- [x] **Live Request Confirmation:** Verify that unchecking Safe Mode requires explicit confirmation.
- [x] **Input Override:** Verify that editing input JSON passes the overridden values to the target node.
- [x] **Canvas Highlight:** Verify that clicking **Focus** locates the node on the workflow canvas.
- [x] **Lineage Preservation:** Verify that the original execution remains unchanged and is linked to the replayed execution.
