-- ------------------------------------------------------------------------------
-- Migration: Production Hardening, Status Constraint & Performance Indexing
-- FlowForge: Stage 10, Batch 7 (Cloud MVP Deployment & Production Hardening)
-- ------------------------------------------------------------------------------

-- 1. Update executions status check constraint to include 'interrupted' status
alter table public.executions
drop constraint if exists executions_status_check;

alter table public.executions
add constraint executions_status_check check (
    status in (
        'queued',
        'running',
        'success',
        'failed',
        'cancelled',
        'waiting',
        'interrupted'
    )
);

-- 2. Performance index for startup stale execution reconciliation and status polling
create index if not exists idx_executions_status_created_at
    on public.executions(status, created_at desc);

-- 3. Composite index for workspace-filtered execution queries
create index if not exists idx_executions_workflow_status
    on public.executions(workflow_id, status);
