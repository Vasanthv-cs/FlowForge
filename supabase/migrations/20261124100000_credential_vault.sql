-- Migration: 20261124100000_credential_vault.sql
-- Description: Workspace-scoped Credential Vault for secure secret storage and workflow reference

CREATE TABLE IF NOT EXISTS public.credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    credential_type TEXT NOT NULL CHECK (credential_type IN ('api_key', 'bearer_token', 'basic_auth', 'custom_headers')),
    encrypted_data TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_version TEXT NOT NULL DEFAULT 'v1',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_credentials_workspace_id 
    ON public.credentials(workspace_id);

CREATE INDEX IF NOT EXISTS idx_credentials_workspace_type 
    ON public.credentials(workspace_id, credential_type);

-- Enable Row Level Security (RLS)
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can view credentials in their workspace
CREATE POLICY "Workspace members can view credentials metadata"
    ON public.credentials
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = public.credentials.workspace_id
              AND wm.user_id = auth.uid()
        )
    );

-- Policy: Only Workspace Owners and Admins can insert credentials
CREATE POLICY "Workspace owners and admins can insert credentials"
    ON public.credentials
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = public.credentials.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: Only Workspace Owners and Admins can update credentials
CREATE POLICY "Workspace owners and admins can update credentials"
    ON public.credentials
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = public.credentials.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: Only Workspace Owners and Admins can delete credentials
CREATE POLICY "Workspace owners and admins can delete credentials"
    ON public.credentials
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = public.credentials.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
        )
    );
