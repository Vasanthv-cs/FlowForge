-- ------------------------------------------------------------------------------
-- Migration: Monitoring, Observability & Scaling Indexes
-- FlowForge: Stage 12, Batch 16 (Monitoring, Observability & Scaling)
-- ------------------------------------------------------------------------------

-- 1. Index for fast workspace execution metrics aggregation by status and created_at
create index if not exists idx_executions_workspace_metrics
    on public.executions(workflow_id, status, created_at desc);

-- 2. Index for duration percentiles and completion analysis
create index if not exists idx_executions_duration_analytics
    on public.executions(status, started_at, finished_at)
    where status in ('success', 'failed');

-- 3. Index for queue waiting time analysis (time between created_at and started_at)
create index if not exists idx_executions_queue_wait
    on public.executions(status, created_at, started_at)
    where status in ('running', 'success', 'failed');

-- 4. Index for node-level failure rate aggregation
create index if not exists idx_node_executions_type_status
    on public.node_executions(node_type, status);

-- 5. Index for long-running execution monitoring
create index if not exists idx_executions_long_running
    on public.executions(status, started_at)
    where status = 'running';

-- 6. Index for active schedule poller efficiency
create index if not exists idx_schedules_active_poller
    on public.schedules(status, next_run_at)
    where status = 'active';

-- 7. Index for workflow listing by workspace
create index if not exists idx_workflows_workspace_active
    on public.workflows(workspace_id, is_active, created_at desc);
