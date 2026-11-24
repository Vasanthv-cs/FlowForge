-- ------------------------------------------------------------------------------
-- Migration: Workflow Templates & Workspace Private Templates
-- FlowForge: Stage 15 (Templates, CLI & Developer Experience)
-- ------------------------------------------------------------------------------

create table if not exists public.workflow_templates (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    name text not null,
    description text default '',
    category text not null default 'general',
    icon text default 'Workflow',
    color text default '#6366f1',
    definition jsonb not null,
    required_config jsonb default '[]'::jsonb,
    required_env_vars jsonb default '[]'::jsonb,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_workflow_templates_workspace
    on public.workflow_templates(workspace_id);

create index if not exists idx_workflow_templates_category
    on public.workflow_templates(category);

-- Enable Row Level Security
alter table public.workflow_templates enable row level security;

-- RLS Policies
create policy "workflow_templates_select_policy"
on public.workflow_templates
for select
to authenticated
using (
    public.is_workspace_member(workspace_id)
);

create policy "workflow_templates_insert_policy"
on public.workflow_templates
for insert
to authenticated
with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin', 'developer'])
);

create policy "workflow_templates_update_policy"
on public.workflow_templates
for update
to authenticated
using (
    public.has_workspace_role(workspace_id, array['owner', 'admin', 'developer'])
);

create policy "workflow_templates_delete_policy"
on public.workflow_templates
for delete
to authenticated
using (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
);
