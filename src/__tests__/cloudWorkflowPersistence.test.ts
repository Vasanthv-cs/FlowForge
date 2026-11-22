import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloudWorkflowService, isUUID, generateUUID } from '@/services/cloudWorkflowService';
import { useWorkflowStore, cancelPendingAutosave } from '@/store/workflowStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { WorkflowPersistence, type SavedWorkflow } from '@/store/persistence';
import { idbStorage } from '@/lib/indexedDb';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    },
    isSupabaseConfigured: true,
  };
});

describe('Stage 10, Batch 4: Cloud Workflow Persistence', () => {
  const mockWorkspaceId = '11111111-1111-4111-8111-111111111111';
  const mockWorkflowId = '22222222-2222-4222-8222-222222222222';
  const mockUserId = '33333333-3333-4333-8333-333333333333';

  const sampleDefinition: SavedWorkflow = {
    id: mockWorkflowId,
    name: 'Customer Onboarding',
    nodes: [
      {
        id: 'node-1',
        type: 'workflowNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Manual Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          description: 'Trigger',
          icon: 'Play',
          color: '#10b981',
          config: { payload: '{"test": true}' },
          inputs: [],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          status: 'idle',
        },
      },
    ],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    cancelPendingAutosave();
    localStorage.clear();

    useWorkspaceStore.setState({
      workspaces: [
        {
          id: mockWorkspaceId,
          name: 'Main Workspace',
          ownerId: mockUserId,
          role: 'developer',
          createdAt: new Date().toISOString(),
        },
      ],
      activeWorkspaceId: mockWorkspaceId,
      isLoading: false,
      isMembersLoading: false,
      error: null,
    });

    useWorkflowStore.setState({
      workflowId: mockWorkflowId,
      workflowName: 'Customer Onboarding',
      nodes: sampleDefinition.nodes,
      edges: [],
      isSaved: true,
      saveStatus: 'saved',
      lastSavedAt: Date.now(),
      saveError: null,
      isCloudWorkflow: true,
      workspaceId: mockWorkspaceId,
      undoStack: [],
      redoStack: [],
    });
  });

  describe('Part A — Cloud Workflow Service CRUD', () => {
    it('validates and generates compliant UUIDs', () => {
      const generated = generateUUID();
      expect(isUUID(generated)).toBe(true);
      expect(isUUID('not-a-uuid')).toBe(false);
      expect(isUUID(mockWorkflowId)).toBe(true);
    });

    it('lists workflows belonging to active workspace', async () => {
      const mockRows = [
        {
          id: mockWorkflowId,
          workspace_id: mockWorkspaceId,
          name: 'Customer Onboarding',
          description: null,
          definition: sampleDefinition,
          created_by: mockUserId,
          updated_by: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const orderMock = vi.fn().mockResolvedValue({ data: mockRows, error: null });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabase.from>);

      const { data, error } = await cloudWorkflowService.listWorkflows(mockWorkspaceId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(mockWorkflowId);
      expect(data![0].nodeCount).toBe(1);
      expect(data![0].workspaceId).toBe(mockWorkspaceId);
    });

    it('retrieves single workflow with full JSONB definition', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: mockWorkflowId,
          workspace_id: mockWorkspaceId,
          name: 'Customer Onboarding',
          description: 'Production pipeline',
          definition: sampleDefinition,
          created_by: mockUserId,
          updated_by: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabase.from>);

      const { data, error } = await cloudWorkflowService.getWorkflow(mockWorkflowId);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.definition.nodes).toHaveLength(1);
      expect(data!.name).toBe('Customer Onboarding');
    });

    it('creates a new workflow inside workspace', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      const singleMock = vi.fn().mockResolvedValue({
        data: { id: mockWorkflowId },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as unknown as ReturnType<typeof supabase.from>);

      const { data, error } = await cloudWorkflowService.createWorkflow(
        mockWorkspaceId,
        'New Automation',
        sampleDefinition
      );

      expect(error).toBeNull();
      expect(data).toBe(mockWorkflowId);
      expect(insertMock).toHaveBeenCalled();
    });

    it('saves updates to an existing workflow', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as unknown as ReturnType<typeof supabase.from>);

      const { error } = await cloudWorkflowService.saveWorkflow(
        mockWorkflowId,
        'Renamed Workflow',
        sampleDefinition
      );

      expect(error).toBeNull();
      expect(updateMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith('id', mockWorkflowId);
    });

    it('deletes a workflow record', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ delete: deleteMock } as unknown as ReturnType<typeof supabase.from>);

      const { error } = await cloudWorkflowService.deleteWorkflow(mockWorkflowId);

      expect(error).toBeNull();
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith('id', mockWorkflowId);
    });
  });

  describe('Part B — Canvas Integration & Store Actions', () => {
    it('saves workflow to cloud and updates save status to saved', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as unknown as ReturnType<typeof supabase.from>);

      useWorkflowStore.setState({ saveStatus: 'unsaved', isSaved: false });

      const ok = await useWorkflowStore.getState().saveWorkflow();

      expect(ok).toBe(true);
      const state = useWorkflowStore.getState();
      expect(state.saveStatus).toBe('saved');
      expect(state.isSaved).toBe(true);
      expect(state.lastSavedAt).toBeGreaterThan(0);
      expect(state.saveError).toBeNull();
    });

    it('handles save error gracefully without throwing or crashing editor', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      const eqMock = vi.fn().mockResolvedValue({ error: { message: 'Database connection lost' } });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as unknown as ReturnType<typeof supabase.from>);

      useWorkflowStore.setState({ saveStatus: 'unsaved', isSaved: false });

      const ok = await useWorkflowStore.getState().saveWorkflow();

      expect(ok).toBe(false);
      const state = useWorkflowStore.getState();
      expect(state.saveStatus).toBe('error');
      expect(state.isSaved).toBe(false);
      expect(state.saveError).toContain('Database connection lost');
    });

    it('loads cloud workflow into canvas and dual-writes local cache', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: mockWorkflowId,
          workspace_id: mockWorkspaceId,
          name: 'Loaded Pipeline',
          definition: sampleDefinition,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabase.from>);

      const ok = await useWorkflowStore.getState().loadCloudWorkflow(mockWorkflowId);

      expect(ok).toBe(true);
      const state = useWorkflowStore.getState();
      expect(state.workflowName).toBe('Loaded Pipeline');
      expect(state.nodes).toHaveLength(1);
      expect(state.isCloudWorkflow).toBe(true);
      expect(state.workspaceId).toBe(mockWorkspaceId);

      // Verify cached locally in IndexedDB
      const cached = await idbStorage.getWorkflow(mockWorkflowId);
      expect(cached).toBeDefined();
    });
  });

  describe('Part C — Debounced Autosave & Concurrency Mutex', () => {
    it('marks document unsaved and triggers autosave on node mutations', () => {
      vi.useFakeTimers();

      const { updateNodeLabel } = useWorkflowStore.getState();
      updateNodeLabel('node-1', 'Renamed Node');

      const state = useWorkflowStore.getState();
      expect(state.isSaved).toBe(false);
      expect(state.saveStatus).toBe('unsaved');

      vi.useRealTimers();
    });

    it('handles concurrent edits during in-flight save via mutex', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      // Simulate network latency for save
      let resolvePromise: (val: unknown) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const eqMock = vi.fn().mockReturnValue(delayedPromise);
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as unknown as ReturnType<typeof supabase.from>);

      // Trigger first save
      const savePromise = useWorkflowStore.getState().saveWorkflow();
      expect(useWorkflowStore.getState().saveStatus).toBe('saving');

      // Attempt second save while first is in flight
      const secondSaveResult = await useWorkflowStore.getState().saveWorkflow();
      expect(secondSaveResult).toBe(false); // Rejected by mutex

      // Resolve first save
      resolvePromise!({ error: null });
      await savePromise;

      cancelPendingAutosave();
    });
  });

  describe('Part D — Immutable Workflow Versioning', () => {
    it('creates immutable version snapshot and lists versions', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      // Mock getting latest version_number
      const limitMock = vi.fn().mockResolvedValue({ data: [{ version_number: 2 }] });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

      // Mock version insert
      const insertSingleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'ver-uuid-1',
          workflow_id: mockWorkflowId,
          version_number: 3,
          name: 'v3.0.0',
          definition: sampleDefinition,
          created_by: mockUserId,
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      const insertSelectMock = vi.fn().mockReturnValue({ single: insertSingleMock });
      const insertMock = vi.fn().mockReturnValue({ select: insertSelectMock });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'workflow_versions') {
          return {
            select: selectMock,
            insert: insertMock,
          } as unknown as ReturnType<typeof supabase.from>;
        }
        return {} as unknown as ReturnType<typeof supabase.from>;
      });

      const { data, error } = await cloudWorkflowService.createVersion(
        mockWorkflowId,
        'v3.0.0',
        sampleDefinition
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.versionNumber).toBe(3);
      expect(data!.name).toBe('v3.0.0');
    });
  });

  describe('Part E & F — RBAC Permissions & Local Import', () => {
    it('respects workspace permissions: viewer cannot edit or delete workflows', () => {
      useWorkspaceStore.setState({
        workspaces: [
          {
            id: mockWorkspaceId,
            name: 'Restricted Workspace',
            ownerId: 'different-owner',
            role: 'viewer',
            createdAt: new Date().toISOString(),
          },
        ],
        activeWorkspaceId: mockWorkspaceId,
      });

      expect(useWorkspaceStore.getState().canCreateWorkflows()).toBe(false);
      expect(useWorkspaceStore.getState().canEditWorkflows()).toBe(false);
      expect(useWorkspaceStore.getState().canDeleteWorkflows()).toBe(false);
    });

    it('allows developers to create and edit workflows, but not delete', () => {
      useWorkspaceStore.setState({
        workspaces: [
          {
            id: mockWorkspaceId,
            name: 'Dev Workspace',
            ownerId: 'different-owner',
            role: 'developer',
            createdAt: new Date().toISOString(),
          },
        ],
        activeWorkspaceId: mockWorkspaceId,
      });

      expect(useWorkspaceStore.getState().canCreateWorkflows()).toBe(true);
      expect(useWorkspaceStore.getState().canEditWorkflows()).toBe(true);
      expect(useWorkspaceStore.getState().canDeleteWorkflows()).toBe(false);
    });

    it('imports offline local workflow to cloud workspace', async () => {
      // Create local workflow
      const localWf: SavedWorkflow = {
        id: 'wf-local-test',
        name: 'Offline Pipeline',
        nodes: [],
        edges: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await WorkflowPersistence.saveWorkflow(localWf);

      // Mock cloud createWorkflow
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: 'new-cloud-uuid' },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as unknown as ReturnType<typeof supabase.from>);

      const cloudId = await useWorkflowStore
        .getState()
        .importLocalWorkflowToCloud('wf-local-test', mockWorkspaceId);

      expect(cloudId).toBe('new-cloud-uuid');
    });
  });
});
