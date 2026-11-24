-- ------------------------------------------------------------------------------
-- Migration: Durable Execution, Leases, Retry Policies & Worker Queue
-- FlowForge: Stage 11, Batch 9 (Durable Execution, Retries & Reliable Cancellation)
-- ------------------------------------------------------------------------------

-- 1. Extend public.executions with queue, worker leasing, and retry attributes
alter table public.executions
add column if not exists worker_id text,
add column if not exists lease_expires_at timestamptz,
add column if not exists last_heartbeat_at timestamptz,
add column if not exists retry_count int not null default 0,
add column if not exists max_retries int not null default 3,
add column if not exists cancellation_requested boolean not null default false,
add column if not exists cancellation_reason text,
add column if not exists available_at timestamptz not null default now();

-- 2. Extend public.node_executions with retry metadata
alter table public.node_executions
add column if not exists retry_count int not null default 0,
add column if not exists max_retries int not null default 0,
add column if not exists retry_history jsonb default '[]'::jsonb;

-- 3. Update check constraint to ensure all valid durable execution states are supported
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

-- 4. Queue claim index: optimized for worker picking up ready queued jobs
create index if not exists idx_executions_queue_claim
    on public.executions(status, available_at, created_at)
    where status = 'queued';

-- 5. Heartbeat & stale lease monitoring index
create index if not exists idx_executions_lease_monitor
    on public.executions(status, lease_expires_at)
    where status = 'running';

-- 6. Atomic Job Claim Function
-- Allows a worker to claim the next available queued job safely avoiding race conditions
create or replace function public.claim_next_execution(
    p_worker_id text,
    p_lease_duration_seconds int default 30
)
returns table (
    claimed_id uuid,
    claimed_workflow_id uuid,
    claimed_workspace_id uuid,
    claimed_input_payload jsonb
)
language plpgsql
security definer
as $$
declare
    v_execution_id uuid;
begin
    -- Select the oldest available queued execution with lock skipping
    select e.id
    into v_execution_id
    from public.executions e
    where e.status = 'queued'
      and e.available_at <= now()
      and e.cancellation_requested = false
    order by e.created_at asc
    limit 1
    for update skip locked;

    if v_execution_id is null then
        return;
    end if;

    -- Atomically transition status to 'running' and set worker lease
    update public.executions
    set status = 'running',
        worker_id = p_worker_id,
        started_at = coalesce(started_at, now()),
        last_heartbeat_at = now(),
        lease_expires_at = now() + (p_lease_duration_seconds || ' seconds')::interval
    where id = v_execution_id;

    -- Return execution metadata for worker consumption
    return query
    select e.id, e.workflow_id, w.workspace_id, e.input_payload
    from public.executions e
    join public.workflows w on w.id = e.workflow_id
    where e.id = v_execution_id;
end;
$$;
