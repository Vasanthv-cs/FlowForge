-- ==============================================================================
-- BATCH 10 MIGRATION: SCHEDULED WORKFLOWS, RECURRING AUTOMATION & RECOVERY POLICIES
-- ==============================================================================

-- 1. Create schedules table supporting both one-time and recurring cron schedules
create table if not exists public.schedules (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    workflow_id uuid not null references public.workflows(id) on delete cascade,
    name text not null,
    schedule_type text not null default 'recurring' check (schedule_type in ('one_time', 'recurring')),
    cron_expression text,
    one_time_run_at timestamptz,
    timezone text not null default 'UTC',
    status text not null default 'active' check (status in ('active', 'paused', 'completed')),
    missed_run_policy text not null default 'skip' check (missed_run_policy in ('skip', 'run_once')),
    next_run_at timestamptz,
    last_run_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Add schedule tracking columns to executions table
alter table public.executions
    add column if not exists schedule_id uuid references public.schedules(id) on delete set null,
    add column if not exists scheduled_for timestamptz;

-- 3. Indexes for fast polling and workspace isolation
create index if not exists idx_schedules_poll on public.schedules(status, next_run_at);
create index if not exists idx_schedules_workspace on public.schedules(workspace_id);
create index if not exists idx_schedules_workflow on public.schedules(workflow_id);
create index if not exists idx_executions_schedule on public.executions(schedule_id);

-- 4. Enable Row Level Security
alter table public.schedules enable row level security;

-- 5. RLS Policies: Workspace members can view schedules; Viewers cannot create or edit
create policy "Workspace members can view workspace schedules"
    on public.schedules
    for select
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = schedules.workspace_id
              and wm.user_id = auth.uid()
        )
    );

create policy "Workspace managers can insert schedules"
    on public.schedules
    for insert
    with check (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = schedules.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin', 'developer')
        )
    );

create policy "Workspace managers can update schedules"
    on public.schedules
    for update
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = schedules.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin', 'developer')
        )
    );

create policy "Workspace managers can delete schedules"
    on public.schedules
    for delete
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = schedules.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin', 'developer')
        )
    );

-- 6. Atomic Schedule Claiming Function with Row-Level Locking
create or replace function public.claim_next_due_schedule(
    p_worker_id text,
    p_now timestamptz default now()
)
returns table (
    id uuid,
    workspace_id uuid,
    workflow_id uuid,
    name text,
    schedule_type text,
    cron_expression text,
    one_time_run_at timestamptz,
    timezone text,
    missed_run_policy text,
    next_run_at timestamptz
)
language plpgsql
security definer
as $$
declare
    v_schedule_id uuid;
begin
    -- Select next due schedule and lock the row to prevent duplicate claims
    select s.id into v_schedule_id
    from public.schedules s
    where s.status = 'active'
      and s.next_run_at <= p_now
    order by s.next_run_at asc
    limit 1
    for update skip locked;

    if v_schedule_id is not null then
        return query
        select 
            s.id,
            s.workspace_id,
            s.workflow_id,
            s.name,
            s.schedule_type,
            s.cron_expression,
            s.one_time_run_at,
            s.timezone,
            s.missed_run_policy,
            s.next_run_at
        from public.schedules s
        where s.id = v_schedule_id;
    end if;
end;
$$;
