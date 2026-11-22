-- ==============================================================================
-- FLOWFORGE CORE DATABASE SCHEMA - MIGRATION 20261122100000
-- Batch 1: Core PostgreSQL Schema, Relational Integrity & RLS Policies
-- ==============================================================================

-- Enable required cryptographic extensions
create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. PROFILES (Linked to Supabase auth.users)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    avatar_url text,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 2. WORKSPACES
-- ------------------------------------------------------------------------------
create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_id uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 3. WORKSPACE MEMBERS & ROLES
-- ------------------------------------------------------------------------------
create table if not exists public.workspace_members (
    workspace_id uuid not null
        references public.workspaces(id) on delete cascade,
    user_id uuid not null
        references auth.users(id) on delete cascade,
    role text not null
        check (role in ('owner', 'admin', 'developer', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 4. WORKFLOWS (Visual DAG Graphs stored as JSONB)
-- ------------------------------------------------------------------------------
create table if not exists public.workflows (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null
        references public.workspaces(id) on delete cascade,
    name text not null,
    description text,
    definition jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users(id),
    updated_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 5. WORKFLOW VERSIONS (Immutable snapshots)
-- ------------------------------------------------------------------------------
create table if not exists public.workflow_versions (
    id uuid primary key default gen_random_uuid(),
    workflow_id uuid not null
        references public.workflows(id) on delete cascade,
    version_number integer not null,
    name text,
    definition jsonb not null,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    unique (workflow_id, version_number)
);

-- ------------------------------------------------------------------------------
-- 6. EXECUTIONS (Workflow execution runs)
-- ------------------------------------------------------------------------------
create table if not exists public.executions (
    id uuid primary key default gen_random_uuid(),
    workflow_id uuid not null
        references public.workflows(id) on delete cascade,
    workflow_version_id uuid
        references public.workflow_versions(id),
    status text not null default 'queued'
        check (
            status in (
                'queued',
                'running',
                'success',
                'failed',
                'cancelled',
                'waiting'
            )
        ),
    trigger_type text not null default 'manual',
    input_payload jsonb,
    output_payload jsonb,
    error_message text,
    started_at timestamptz,
    finished_at timestamptz,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 7. NODE EXECUTIONS (Granular node execution records)
-- ------------------------------------------------------------------------------
create table if not exists public.node_executions (
    id uuid primary key default gen_random_uuid(),
    execution_id uuid not null
        references public.executions(id) on delete cascade,
    node_id text not null,
    node_type text not null,
    status text not null default 'pending',
    input_payload jsonb,
    output_payload jsonb,
    error_message text,
    duration_ms bigint,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    unique (execution_id, node_id)
);

-- ------------------------------------------------------------------------------
-- 8. EXECUTION EVENTS (Timeline audit trail)
-- ------------------------------------------------------------------------------
create table if not exists public.execution_events (
    id bigint generated always as identity primary key,
    execution_id uuid not null
        references public.executions(id) on delete cascade,
    node_id text,
    event_type text not null,
    message text,
    metadata jsonb,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
create index if not exists idx_workspaces_owner
    on public.workspaces(owner_id);

create index if not exists idx_workspace_members_user
    on public.workspace_members(user_id);

create index if not exists idx_workflows_workspace
    on public.workflows(workspace_id);

create index if not exists idx_workflow_versions_workflow
    on public.workflow_versions(workflow_id, version_number desc);

create index if not exists idx_executions_workflow
    on public.executions(workflow_id, created_at desc);

create index if not exists idx_executions_status
    on public.executions(status);

create index if not exists idx_node_executions_execution
    on public.node_executions(execution_id);

create index if not exists idx_execution_events_execution
    on public.execution_events(execution_id, created_at);

-- ------------------------------------------------------------------------------
-- WORKSPACE SECURITY HELPER FUNCTION
-- ------------------------------------------------------------------------------
create or replace function public.is_workspace_member(
    target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = target_workspace_id
          and wm.user_id = auth.uid()
    );
$$;

revoke all on function public.is_workspace_member(uuid)
    from public;
revoke execute on function public.is_workspace_member(uuid)
    from anon;

grant execute on function public.is_workspace_member(uuid)
    to authenticated;

-- ------------------------------------------------------------------------------
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.executions enable row level security;
alter table public.node_executions enable row level security;
alter table public.execution_events enable row level security;

-- ------------------------------------------------------------------------------
-- RLS POLICIES
-- ------------------------------------------------------------------------------

-- Profiles
create policy "profile_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profile_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Workspaces
create policy "workspace_select_member"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

-- Workspace Members
create policy "member_select_workspace"
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Workflows
create policy "workflow_select_member"
on public.workflows
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Workflow Versions
create policy "version_select_member"
on public.workflow_versions
for select
to authenticated
using (
    exists (
        select 1
        from public.workflows w
        where w.id = workflow_id
          and public.is_workspace_member(w.workspace_id)
    )
);

-- Executions
create policy "execution_select_member"
on public.executions
for select
to authenticated
using (
    exists (
        select 1
        from public.workflows w
        where w.id = workflow_id
          and public.is_workspace_member(w.workspace_id)
    )
);

-- Node Executions
create policy "node_execution_select_member"
on public.node_executions
for select
to authenticated
using (
    exists (
        select 1
        from public.executions e
        join public.workflows w on w.id = e.workflow_id
        where e.id = execution_id
          and public.is_workspace_member(w.workspace_id)
    )
);

-- Execution Events
create policy "execution_events_select_member"
on public.execution_events
for select
to authenticated
using (
    exists (
        select 1
        from public.executions e
        join public.workflows w on w.id = e.workflow_id
        where e.id = execution_id
          and public.is_workspace_member(w.workspace_id)
    )
);
