-- ==============================================================================
-- FLOWFORGE AUTH & RBAC POLICIES - MIGRATION 20261122110000
-- Batch 2 & Batch 3: Auth Triggers, Role-Based Access Control & Stored Procedures
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RBAC HELPER FUNCTIONS (SECURITY DEFINER with secure search_path)
-- ------------------------------------------------------------------------------

-- Get caller's role in a workspace
create or replace function public.get_workspace_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = target_workspace_id and user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_workspace_role(uuid) from public;
revoke execute on function public.get_workspace_role(uuid) from anon;
grant execute on function public.get_workspace_role(uuid) to authenticated;

-- Check if caller holds any of the allowed roles in target workspace
create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.has_workspace_role(uuid, text[]) from public;
revoke execute on function public.has_workspace_role(uuid, text[]) from anon;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

-- ------------------------------------------------------------------------------
-- 2. NEW USER SIGNUP TRIGGER (Automatic Profile + Default Workspace Creation)
-- ------------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ws_id uuid;
  user_display text;
begin
  -- Derive display name from metadata or email
  user_display := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1),
    'FlowForge Developer'
  );

  -- 1. Create Profile
  insert into public.profiles (id, display_name, avatar_url, created_at)
  values (
    new.id,
    user_display,
    new.raw_user_meta_data->>'avatar_url',
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);

  -- 2. Create Default "Personal Workspace"
  insert into public.workspaces (name, owner_id, created_at)
  values ('Personal Workspace', new.id, now())
  returning id into new_ws_id;

  -- 3. Assign Owner membership
  insert into public.workspace_members (workspace_id, user_id, role, created_at)
  values (new_ws_id, new.id, 'owner', now());

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

-- Bind trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 3. WORKSPACE MANAGEMENT STORED PROCEDURES
-- ------------------------------------------------------------------------------

-- Create workspace and establish owner
create or replace function public.create_workspace(name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ws_id uuid;
  clean_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clean_name := trim(coalesce(name, ''));
  if clean_name = '' then
    raise exception 'Workspace name cannot be empty';
  end if;

  insert into public.workspaces (name, owner_id)
  values (clean_name, auth.uid())
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, auth.uid(), 'owner');

  return new_ws_id;
end;
$$;

revoke all on function public.create_workspace(text) from public;
revoke execute on function public.create_workspace(text) from anon;
grant execute on function public.create_workspace(text) to authenticated;

-- Add member by email
create or replace function public.add_workspace_member_by_email(
  target_workspace_id uuid,
  target_email text,
  member_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  target_display text;
  clean_email text;
  clean_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Verify caller is owner or admin
  if not public.has_workspace_role(target_workspace_id, array['owner', 'admin']) then
    raise exception 'Only workspace owners and admins can invite members';
  end if;

  clean_role := lower(trim(coalesce(member_role, '')));
  if clean_role not in ('admin', 'developer', 'viewer') then
    raise exception 'Invalid role. Choose admin, developer, or viewer';
  end if;

  clean_email := lower(trim(coalesce(target_email, '')));
  if clean_email = '' then
    raise exception 'Email address is required';
  end if;

  -- Look up target user in auth.users
  select id into target_user_id
  from auth.users
  where lower(email) = clean_email
  limit 1;

  if target_user_id is null then
    raise exception 'No registered FlowForge user found with email: %', clean_email;
  end if;

  -- Check duplicate
  if exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = target_user_id
  ) then
    raise exception 'User is already a member of this workspace';
  end if;

  -- Insert member
  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, target_user_id, clean_role);

  -- Fetch display name
  select coalesce(display_name, clean_email) into target_display
  from public.profiles
  where id = target_user_id;

  return json_build_object(
    'userId', target_user_id,
    'email', clean_email,
    'displayName', coalesce(target_display, clean_email),
    'role', clean_role
  )::jsonb;
end;
$$;

revoke all on function public.add_workspace_member_by_email(uuid, text, text) from public;
revoke execute on function public.add_workspace_member_by_email(uuid, text, text) from anon;
grant execute on function public.add_workspace_member_by_email(uuid, text, text) to authenticated;

-- Change member role
create or replace function public.update_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_current_role text;
  clean_new_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  caller_role := public.get_workspace_role(target_workspace_id);
  if caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can modify member roles';
  end if;

  clean_new_role := lower(trim(coalesce(new_role, '')));
  if clean_new_role not in ('admin', 'developer', 'viewer') then
    raise exception 'Invalid role. Choose admin, developer, or viewer';
  end if;

  select role into target_current_role
  from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id;

  if target_current_role is null then
    raise exception 'User is not a member of this workspace';
  end if;

  -- Owner cannot have role changed via this method
  if target_current_role = 'owner' then
    raise exception 'Cannot change the workspace owner role directly. Transfer ownership instead.';
  end if;

  -- Admin cannot modify another admin or promote to owner
  if caller_role = 'admin' and target_current_role = 'admin' and target_user_id != auth.uid() then
    raise exception 'Admins cannot change the role of another admin';
  end if;

  update public.workspace_members
  set role = clean_new_role
  where workspace_id = target_workspace_id and user_id = target_user_id;
end;
$$;

revoke all on function public.update_workspace_member_role(uuid, uuid, text) from public;
revoke execute on function public.update_workspace_member_role(uuid, uuid, text) from anon;
grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;

-- Remove workspace member
create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_current_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role into target_current_role
  from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id;

  if target_current_role is null then
    raise exception 'User is not a member of this workspace';
  end if;

  if target_current_role = 'owner' then
    raise exception 'Cannot remove workspace owner. Transfer ownership or delete the workspace.';
  end if;

  -- If user is leaving voluntarily
  if target_user_id = auth.uid() then
    delete from public.workspace_members
    where workspace_id = target_workspace_id and user_id = target_user_id;
    return;
  end if;

  -- Otherwise, caller must be owner or admin
  caller_role := public.get_workspace_role(target_workspace_id);
  if caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can remove members';
  end if;

  if caller_role = 'admin' and target_current_role = 'admin' then
    raise exception 'Admins cannot remove other admins';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id;
end;
$$;

revoke all on function public.remove_workspace_member(uuid, uuid) from public;
revoke execute on function public.remove_workspace_member(uuid, uuid) from anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

-- Delete workspace (Owner only)
create or replace function public.delete_workspace(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.workspaces
    where id = target_workspace_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the workspace owner can delete this workspace';
  end if;

  delete from public.workspaces
  where id = target_workspace_id and owner_id = auth.uid();
end;
$$;

revoke all on function public.delete_workspace(uuid) from public;
revoke execute on function public.delete_workspace(uuid) from anon;
grant execute on function public.delete_workspace(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. RLS WRITE POLICIES (INSERT / UPDATE / DELETE)
-- ------------------------------------------------------------------------------

-- Workspaces
create policy "workspace_insert_creator"
on public.workspaces
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "workspace_update_owner_admin"
on public.workspaces
for update
to authenticated
using (public.has_workspace_role(id, array['owner', 'admin']))
with check (public.has_workspace_role(id, array['owner', 'admin']));

create policy "workspace_delete_owner"
on public.workspaces
for delete
to authenticated
using (owner_id = auth.uid());

-- Workspace Members
create policy "member_insert_policy"
on public.workspace_members
for insert
to authenticated
with check (
  -- Owner establishing self during workspace creation
  (user_id = auth.uid() and role = 'owner' and exists (
    select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()
  ))
  -- Or admin/owner adding non-owner member
  or (public.has_workspace_role(workspace_id, array['owner', 'admin']) and role != 'owner')
);

create policy "member_update_policy"
on public.workspace_members
for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']) and role != 'owner');

create policy "member_delete_policy"
on public.workspace_members
for delete
to authenticated
using (
  -- Member leaving voluntarily (except owner)
  (user_id = auth.uid() and role != 'owner')
  -- Or owner/admin removing non-owner member
  or (public.has_workspace_role(workspace_id, array['owner', 'admin']) and role != 'owner')
);

-- Workflows
create policy "workflow_insert_policy"
on public.workflows
for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'developer']));

create policy "workflow_update_policy"
on public.workflows
for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'developer']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'developer']));

create policy "workflow_delete_policy"
on public.workflows
for delete
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- Workflow Versions
create policy "version_insert_policy"
on public.workflow_versions
for insert
to authenticated
with check (
  exists (
    select 1 from public.workflows w
    where w.id = workflow_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin', 'developer'])
  )
);

create policy "version_delete_policy"
on public.workflow_versions
for delete
to authenticated
using (
  exists (
    select 1 from public.workflows w
    where w.id = workflow_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin'])
  )
);

-- Executions
create policy "execution_insert_policy"
on public.executions
for insert
to authenticated
with check (
  exists (
    select 1 from public.workflows w
    where w.id = workflow_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin', 'developer'])
  )
);

create policy "execution_update_policy"
on public.executions
for update
to authenticated
using (
  exists (
    select 1 from public.workflows w
    where w.id = workflow_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin', 'developer'])
  )
);

create policy "execution_delete_policy"
on public.executions
for delete
to authenticated
using (
  exists (
    select 1 from public.workflows w
    where w.id = workflow_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin'])
  )
);

-- Node Executions
create policy "node_execution_insert_policy"
on public.node_executions
for insert
to authenticated
with check (
  exists (
    select 1 from public.executions e
    join public.workflows w on w.id = e.workflow_id
    where e.id = execution_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin', 'developer'])
  )
);

create policy "node_execution_update_policy"
on public.node_executions
for update
to authenticated
using (
  exists (
    select 1 from public.executions e
    join public.workflows w on w.id = e.workflow_id
    where e.id = execution_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin', 'developer'])
  )
);

create policy "node_execution_delete_policy"
on public.node_executions
for delete
to authenticated
using (
  exists (
    select 1 from public.executions e
    join public.workflows w on w.id = e.workflow_id
    where e.id = execution_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin'])
  )
);

-- Execution Events
create policy "execution_events_insert_policy"
on public.execution_events
for insert
to authenticated
with check (
  exists (
    select 1 from public.executions e
    join public.workflows w on w.id = e.workflow_id
    where e.id = execution_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin', 'developer'])
  )
);

create policy "execution_events_delete_policy"
on public.execution_events
for delete
to authenticated
using (
  exists (
    select 1 from public.executions e
    join public.workflows w on w.id = e.workflow_id
    where e.id = execution_id
      and public.has_workspace_role(w.workspace_id, array['owner', 'admin'])
  )
);
