-- ==============================================================================
-- BATCH 10 MIGRATION: WEBHOOK TRIGGERS, SCHEDULED WORKFLOWS (CRON) & PUBLIC ENDPOINTS
-- ==============================================================================

-- 1. Add is_active column to workflows table if it does not already exist
alter table public.workflows 
    add column if not exists is_active boolean not null default true;

-- 2. WORKFLOW WEBHOOKS TABLE
-- Tracks registered webhook entry points mapped to workflows and trigger nodes
create table if not exists public.workflow_webhooks (
    id uuid primary key default gen_random_uuid(),
    workflow_id uuid not null references public.workflows(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    node_id text not null,
    path text not null unique,
    http_method text not null default 'POST' check (http_method in ('POST', 'GET', 'PUT', 'ALL')),
    auth_type text not null default 'none' check (auth_type in ('none', 'header-secret', 'bearer-token', 'hmac-sha256')),
    secret_token text,
    header_name text not null default 'X-Webhook-Secret',
    respond_mode text not null default 'immediate' check (respond_mode in ('immediate', 'sync')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workflow_id, node_id)
);

create index if not exists idx_workflow_webhooks_path on public.workflow_webhooks(path);
create index if not exists idx_workflow_webhooks_workflow on public.workflow_webhooks(workflow_id);

-- 3. WORKFLOW SCHEDULES TABLE
-- Tracks cron-based scheduled workflows and next execution dispatch times
create table if not exists public.workflow_schedules (
    id uuid primary key default gen_random_uuid(),
    workflow_id uuid not null references public.workflows(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    node_id text not null,
    cron_expression text not null,
    timezone text not null default 'UTC',
    enabled boolean not null default true,
    last_run_at timestamptz,
    next_run_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workflow_id, node_id)
);

create index if not exists idx_workflow_schedules_poll on public.workflow_schedules(enabled, next_run_at);
create index if not exists idx_workflow_schedules_workflow on public.workflow_schedules(workflow_id);

-- 4. Enable RLS
alter table public.workflow_webhooks enable row level security;
alter table public.workflow_schedules enable row level security;

-- 5. RLS Policies: Workspace members can view webhooks and schedules in their workspace
create policy "Workspace members can view workflow webhooks"
    on public.workflow_webhooks
    for select
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = workflow_webhooks.workspace_id
              and wm.user_id = auth.uid()
        )
    );

create policy "Workspace members can manage workflow webhooks"
    on public.workflow_webhooks
    for all
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = workflow_webhooks.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin', 'developer')
        )
    );

create policy "Workspace members can view workflow schedules"
    on public.workflow_schedules
    for select
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = workflow_schedules.workspace_id
              and wm.user_id = auth.uid()
        )
    );

create policy "Workspace members can manage workflow schedules"
    on public.workflow_schedules
    for all
    using (
        exists (
            select 1 from public.workspace_members wm
            where wm.workspace_id = workflow_schedules.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin', 'developer')
        )
    );
