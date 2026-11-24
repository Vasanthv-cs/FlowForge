# FlowForge Monitoring & Observability Guide

This guide details FlowForge's production monitoring, observability architecture, health probe contracts, execution metrics calculation, and logging standards.

---

## 1. Health & Readiness Probes

FlowForge implements distinct **Liveness** and **Readiness** probes to support container orchestration (Kubernetes, Docker Swarm, Nomad) and cloud load balancers (AWS ALB, GCP Cloud Run, Cloudflare).

```
                         [ Load Balancer / Ingress ]
                                      |
              +-----------------------+-----------------------+
              |                                               |
     [ Liveness Probe ]                              [ Readiness Probe ]
     GET /health & /health/live                      GET /ready & /health/ready
              |                                               |
     - Process running?                              - DB connection reachable?
     - Memory limits ok?                             - Worker queue available?
     - Event loop responsive?                        - Scheduler running?
              |                                               |
         200 OK                                       200 OK / 503 Degraded
```

### 1.1. Liveness Probe (`GET /health` & `GET /health/live`)
- **Purpose**: Verifies that the Fastify process is running, the Node.js event loop is responsive, and process memory is tracked.
- **Contract**:
  - Always returns `200 OK` unless the process is completely locked or terminating.
  - Does **not** query external dependencies (avoids cascading restarts during transient database outages).

**Response Schema**:
```json
{
  "status": "ok",
  "uptimeSeconds": 3600,
  "timestamp": "2026-11-24T10:00:00.000Z",
  "service": "flowforge-backend-api",
  "version": "0.1.0",
  "memory": {
    "rssBytes": 84213760,
    "heapUsedBytes": 42106880,
    "heapTotalBytes": 67108864
  }
}
```

### 1.2. Readiness Probe (`GET /ready` & `GET /health/ready`)
- **Purpose**: Verifies that FlowForge can actively accept and process requests.
- **Checks**:
  1. **PostgreSQL Connectivity**: Actively probes the primary database with low-overhead queries.
  2. **Worker Status**: Checks background queue consumer worker availability and active concurrency.
  3. **Queue Health**: Inspects backlog of queued jobs awaiting execution.
  4. **Scheduler Status**: Checks whether the recurring cron engine is active and polling.
- **Security & Masking**:
  - In production (`NODE_ENV=production`), internal database connection strings, credentials, and raw SQL error messages are strictly masked.
  - Returns `200 OK` when healthy, or `503 Service Unavailable` when database is down.

**Ready Response (200 OK)**:
```json
{
  "status": "ready",
  "database": "connected",
  "latencyMs": 12,
  "worker": {
    "status": "available",
    "workerId": "worker-4f81a20c",
    "activeJobs": 2,
    "maxConcurrency": 10
  },
  "queue": {
    "status": "operational",
    "queuedCount": 0,
    "runningCount": 2
  },
  "scheduler": {
    "status": "running",
    "isPolling": false,
    "pollIntervalMs": 10000
  },
  "timestamp": "2026-11-24T10:00:00.000Z"
}
```

---

## 2. Execution Metrics Engine

Metrics are calculated dynamically from persisted records in PostgreSQL (`executions` and `node_executions`), providing accurate, tamper-proof operational data without synthetic extrapolation.

### Metric Definitions & Calculations

| Metric | Source / Formula | Purpose |
|---|---|---|
| **Total Executions** | `COUNT(*)` in time range | Total workflow traffic volume |
| **Success Rate** | `(Success Count / Total Count) * 100` | High-level reliability percentage |
| **Failure Rate** | `(Failed Count / Total Count) * 100` | Percentage of aborts and unhandled errors |
| **Avg Duration** | `SUM(finished_at - started_at) / N` | Average run latency for completed workflows |
| **Percentile Latency (P50, P90, P95)** | Mathematical percentile rank of duration values | Detects tail latency and slow API dependencies |
| **Queue Wait Time** | `started_at - created_at` | Time spent waiting for an available worker thread |
| **Retry Rate** | `(Executions with Retries / Total) * 100` | Percentage of workflows that experienced retries |
| **Node Failure Rates** | `(Node Failures / Node Invocations) * 100` | Identifies which integration node types fail most often |

### Metrics API (`GET /api/workspaces/:workspaceId/metrics`)
- Protected by Supabase JWT and Workspace RBAC (`READ_ROLES`).
- Supports query parameters:
  - `timeRange`: `'1h' | '24h' | '7d' | '30d'` (default: `'24h'`)
  - `workflowId`: Filters metrics to a specific workflow definition.

---

## 3. Monitoring Dashboard UI

FlowForge features a built-in monitoring dashboard accessible via the **Monitoring** button in the TopNav toolbar:

1. **KPI Stat Cards**: Instant visibility into total executions, success rate %, average latency, and queue wait times.
2. **Interactive Volume & Trend Chart**: SVG stacked bar chart illustrating successful versus failed execution volume over time buckets.
3. **Node Failure Diagnostics**: Ranked list of node integration types with failure percentages and progress bars.
4. **Recent Failures Inspector**: Real-time table of recent failures with error messages, run duration, trigger type, and execution ID.
5. **Infrastructure Health Indicators**: Live badges tracking database connection ping latency, worker concurrency, and cron scheduler state.
6. **Auto-Refresh Controls**: Switch between manual refresh, 10-second polling, or 30-second polling.

---

## 4. Structured Logging Standards

Backend logs adhere to strict structured JSON logging using Pino:

- **Consistent Fields**: Every log entry includes `timestamp`, `service: 'flowforge-backend'`, `reqId`, and contextual IDs (`executionId`, `workspaceId`).
- **Log Levels**:
  - `info`: Key operational milestones (server startup, worker start, workflow claimed, workflow completed).
  - `warn`: Recoverable anomalies (retried step, degraded latency, circuit breaker warning).
  - `error`: Unrecoverable errors (database connection loss, unhandled execution exceptions).
- **Automated Redaction**: Sensitive fields matching `password`, `token`, `secret`, `apiKey`, and `authorization` headers are replaced with `[REDACTED]`.
