# FlowForge Production Operations & Runbook

This runbook outlines operational procedures, alert thresholds, crash recovery, graceful shutdown protocols, and troubleshooting steps for FlowForge administrators.

---

## 1. Production Architecture Overview

A resilient FlowForge production deployment comprises:

1. **Frontend App**: Static React/Vite assets served via CDN or reverse proxy (Cloudflare, Nginx).
2. **Backend Fastify API**: Stateless Node.js service running behind a load balancer with TLS termination.
3. **Durable Queue Worker**: Background process consuming queued workflow executions.
4. **Cron Scheduler**: Poller evaluating recurring workflow schedules every 10 seconds.
5. **Database**: Managed Supabase PostgreSQL with transaction connection pooling.

---

## 2. Recommended Alert Thresholds

Configure synthetic uptime checks and APM alerts on the following metrics:

| Metric / Check | Warning Threshold | Critical Threshold | Action |
|---|---|---|---|
| **Readiness Probe (`GET /ready`)** | Status `unready` (1 check) | Status `unready` (>2 checks) | Check PostgreSQL database connectivity |
| **Database Latency** | `> 100ms` | `> 300ms` | Inspect active database query locks or connection pool starvation |
| **Execution Queue Backlog** | `> 25 queued` | `> 100 queued` | Scale up durable worker pods or investigate stalled executions |
| **Workspace Failure Rate** | `> 10%` | `> 25%` | Inspect recent failure logs for upstream API outages or bad credentials |
| **Long-Running Executions** | `> 10 running (>30s)` | `> 25 running (>30s)` | Check external HTTP request timeouts and SSRF proxy latency |
| **Process Memory (RSS)** | `> 400MB` | `> 800MB` | Restart backend instance; check for memory leaks |

---

## 3. Graceful Shutdown & Crash Recovery

### Graceful Termination Lifecycle
When a worker or backend container receives `SIGTERM` or `SIGINT`:

```
[ SIGTERM Received ]
        |
        v
1. Stop accepting new HTTP requests (Fastify app.close())
2. Stop scheduler polling loop (workflowSchedulerService.stop())
3. Stop worker polling loop (durableWorker.stop())
4. Allow in-flight jobs 3 seconds grace period to finish
5. Abort unfinished jobs with "Server stopping (SIGTERM)"
6. Process exit 0
```

### Stale Execution & Crash Recovery
If a server or worker container is forcefully killed (e.g., OOM killed, node eviction, power cut):

1. **Automatic Lease Expiration**: Jobs claimed by the dead worker have `lease_expires_at = now() + 30s`.
2. **Surviving Worker Recovery**: When surviving or newly launched workers start up, they automatically invoke `recoverStaleLeases()`.
3. **Automatic Re-Queuing**: If an interrupted job has remaining retries (`retry_count < max_retries`), it is automatically requeued for execution with backoff. If max retries are exceeded, the job transitions to `interrupted`.

---

## 4. Troubleshooting Common Failures

### 4.1. "Database connection probe failed" (503 on `/ready`)
- **Symptoms**: Load balancer removes container from traffic pool; dashboard shows disconnected badge.
- **Root Cause**: PostgreSQL connection pool exhausted, network partition between backend and database, or invalid Supabase service role key.
- **Resolution**:
  1. Check database CPU and connection count in Supabase dashboard.
  2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
  3. Ensure transaction pooling mode is enabled on port 6543.

### 4.2. Workflows Stuck in "queued" Status
- **Symptoms**: Executions are created but never transition to `running`.
- **Root Cause**: Durable worker service is not running or worker concurrency limit reached.
- **Resolution**:
  1. Verify backend logs for `[FlowForge] Durable queue worker started`.
  2. Inspect `GET /ready` output to verify `worker.status === 'available'`.
  3. Check if workspace reached its `maxPerWorkspaceConcurrency` (default 5).

### 4.3. High Failure Rate on HTTP Request Nodes
- **Symptoms**: Node failure breakdown shows elevated failure rates for `http-request`.
- **Root Cause**: External API timeout, invalid credential token, or SSRF protection blocked an internal host.
- **Resolution**:
  1. Inspect the Recent Failures table in the Monitoring Dashboard to review the exact error string.
  2. If error is `SSRF Protection: Blocked private or loopback IP`, verify that the target endpoint is a public hostname.
  3. If error is `401 Unauthorized`, verify that the workspace Credential Vault secret has not expired.

---

## 5. Routine Maintenance & Operations

- **Database Vacuuming**: PostgreSQL automatically runs autovacuum; ensure autovacuum is active on `executions` and `node_executions`.
- **Log Rotation**: Ensure stdout/stderr logs are ingested into an external aggregator (Datadog, Grafana Loki, CloudWatch) with 30-day retention.
- **Database Backup**: Maintain daily automated database snapshots via Supabase with point-in-time recovery enabled.
