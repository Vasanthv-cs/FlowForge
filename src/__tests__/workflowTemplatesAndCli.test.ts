import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

import {
  STARTER_WORKFLOW_TEMPLATES,
  validateWorkflowTemplate,
  instantiateWorkflowFromTemplate,
  type WorkflowTemplate,
} from '@flowforge/workflow-schema';
import {
  detectRequiredEnvVars,
  validateWorkflowEnvironment,
  interpolateWorkflowEnvironment,
} from '@flowforge/workflow-core';
import {
  maskToken,
  saveCliConfig,
  loadCliConfig,
  getEffectiveCliConfig,
  type CliConfigFile,
} from '../../packages/cli/src/config';
import { parseArgs } from '../../packages/cli/src/index';
import { workflowValidateCommand } from '../../packages/cli/src/commands/workflowValidate';
import { workflowExportCommand } from '../../packages/cli/src/commands/workflowExport';
import { workflowPushCommand } from '../../packages/cli/src/commands/workflowPush';
import { buildApp } from '../server/app';
import * as supabaseModule from '../server/supabase';

const mockWorkspaceId = '11111111-1111-4111-8111-111111111111';
const mockUserId = '22222222-2222-4222-8222-222222222222';
const mockTemplateId = '33333333-3333-4333-8333-333333333333';

describe('Batch 15: Workflow Templates, CLI & Developer Experience', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowforge-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  /* ─────────────────────────────────────────────────────────────
   * 1. Workflow Template Schema & Starter Templates
   * ───────────────────────────────────────────────────────────── */
  describe('1. Workflow Template Schema & Starter Templates', () => {
    it('has 5 valid built-in starter templates that pass schema and DAG validation', () => {
      expect(STARTER_WORKFLOW_TEMPLATES).toHaveLength(5);

      for (const tpl of STARTER_WORKFLOW_TEMPLATES) {
        const validation = validateWorkflowTemplate(tpl);
        expect(validation.isValid, `Template ${tpl.name} failed: ${validation.errors.join(', ')}`).toBe(true);
        expect(validation.errors).toHaveLength(0);
        expect(validation.requiredEnvVars).toBeDefined();
      }
    });

    it('rejects a template containing an invalid/unknown node type', () => {
      const invalidTpl: WorkflowTemplate = {
        id: 'bad-node-template',
        name: 'Bad Node Template',
        description: 'Contains an unsupported node type',
        category: 'general',
        icon: 'Workflow',
        color: '#6366f1',
        requiredConfig: [],
        requiredEnvVars: [],
        definition: {
          id: 'def-1',
          name: 'Def 1',
          nodes: [
            {
              id: 'n1',
              type: 'workflowNode',
              position: { x: 0, y: 0 },
              data: {
                label: 'Trigger',
                type: 'manual-trigger',
                category: 'trigger',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [],
                outputs: [{ id: 'out', label: 'Out', type: 'any' }],
                config: {},
              },
            },
            {
              id: 'n2',
              type: 'workflowNode',
              position: { x: 200, y: 0 },
              data: {
                label: 'Malicious Node',
                type: 'arbitrary-exec-bad-node' as any,
                category: 'utility',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [{ id: 'in', label: 'In', type: 'any' }],
                outputs: [],
                config: {},
              },
            },
          ],
          edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        isWorkspaceTemplate: false,
      };

      const result = validateWorkflowTemplate(invalidTpl);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.toLowerCase().includes('unknown') || e.toLowerCase().includes('unrecognized')
        )
      ).toBe(true);
    });

    it('rejects a template containing a DAG cycle', () => {
      const cycleTpl: WorkflowTemplate = {
        id: 'cycle-template',
        name: 'Cyclic Template',
        description: 'Template with a loop',
        category: 'automation',
        icon: 'Workflow',
        color: '#6366f1',
        requiredConfig: [],
        requiredEnvVars: [],
        definition: {
          id: 'def-cycle',
          name: 'Def Cycle',
          nodes: [
            {
              id: 'n1',
              type: 'workflowNode',
              position: { x: 0, y: 0 },
              data: {
                label: 'Trigger',
                type: 'manual-trigger',
                category: 'trigger',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [],
                outputs: [{ id: 'out', label: 'Out', type: 'any' }],
                config: {},
              },
            },
            {
              id: 'n2',
              type: 'workflowNode',
              position: { x: 200, y: 0 },
              data: {
                label: 'Transformer',
                type: 'set-data',
                category: 'data',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [{ id: 'in', label: 'In', type: 'any' }],
                outputs: [{ id: 'out', label: 'Out', type: 'any' }],
                config: {},
              },
            },
          ],
          edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n1' }, // Cycle!
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        isWorkspaceTemplate: false,
      };

      const result = validateWorkflowTemplate(cycleTpl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('cycle') || e.includes('DAG'))).toBe(true);
    });

    it('rejects a template without any trigger node', () => {
      const noTriggerTpl: WorkflowTemplate = {
        id: 'no-trigger-template',
        name: 'No Trigger Template',
        description: 'Lacks a trigger node',
        category: 'general',
        icon: 'Workflow',
        color: '#6366f1',
        requiredConfig: [],
        requiredEnvVars: [],
        definition: {
          id: 'def-no-trig',
          name: 'Def No Trig',
          nodes: [
            {
              id: 'n1',
              type: 'workflowNode',
              position: { x: 0, y: 0 },
              data: {
                label: 'Log Output',
                type: 'console-output',
                category: 'utility',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [{ id: 'in', label: 'In', type: 'any' }],
                outputs: [],
                config: {},
              },
            },
          ],
          edges: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        isWorkspaceTemplate: false,
      };

      const result = validateWorkflowTemplate(noTriggerTpl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('trigger'))).toBe(true);
    });

    it('rejects a template containing exposed secret tokens or credentials', () => {
      const secretTpl: WorkflowTemplate = {
        id: 'secret-leak-template',
        name: 'Leaky Template',
        description: 'Hardcoded secrets in config',
        category: 'general',
        icon: 'Workflow',
        color: '#6366f1',
        requiredConfig: [],
        requiredEnvVars: [],
        definition: {
          id: 'def-secret',
          name: 'Def Secret',
          nodes: [
            {
              id: 'n1',
              type: 'workflowNode',
              position: { x: 0, y: 0 },
              data: {
                label: 'Trigger',
                type: 'manual-trigger',
                category: 'trigger',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [],
                outputs: [{ id: 'out', label: 'Out', type: 'any' }],
                config: {},
              },
            },
            {
              id: 'n2',
              type: 'workflowNode',
              position: { x: 200, y: 0 },
              data: {
                label: 'HTTP Call',
                type: 'http-request',
                category: 'logic',
                description: '',
                icon: 'Workflow',
                color: '#6366f1',
                inputs: [{ id: 'in', label: 'In', type: 'any' }],
                outputs: [{ id: 'out', label: 'Out', type: 'any' }],
                config: {
                  url: 'https://api.example.com/data',
                  headers: {
                    Authorization: `Bearer ${['sk', 'live', '999999999999999999999999'].join('_')}`,
                  },
                },
              },
            },
          ],
          edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        isWorkspaceTemplate: false,
      };

      const result = validateWorkflowTemplate(secretTpl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('secret') || e.includes('credential'))).toBe(true);
    });

    it('instantiates a template with fresh unique node IDs and preserved edge topology', () => {
      const template = STARTER_WORKFLOW_TEMPLATES[0]; // Manual -> Transform -> Console
      const originalNodeIds = template.definition.nodes.map((n) => n.id);

      const workflow = instantiateWorkflowFromTemplate(template, 'My Instantiated Pipeline');

      expect(workflow.name).toBe('My Instantiated Pipeline');
      expect(workflow.nodes).toHaveLength(template.definition.nodes.length);
      expect(workflow.edges).toHaveLength(template.definition.edges.length);

      // Node IDs must be remapped
      const newNodeIds = workflow.nodes.map((n) => n.id);
      for (const id of originalNodeIds) {
        expect(newNodeIds).not.toContain(id);
      }

      // Edges must connect the new node IDs correctly
      for (const edge of workflow.edges) {
        expect(newNodeIds).toContain(edge.source);
        expect(newNodeIds).toContain(edge.target);
      }
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 2. Workflow Environment Handling & Substitution
   * ───────────────────────────────────────────────────────────── */
  describe('2. Workflow Environment Handling & Substitution', () => {
    const sampleWorkflow = {
      id: 'wf-env-1',
      name: 'Env Test Workflow',
      nodes: [
        {
          id: 'n1',
          type: 'workflowNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Trigger {{env.ENVIRONMENT_NAME}}',
            type: 'manual-trigger',
            category: 'trigger' as const,
            inputs: [],
            outputs: [{ id: 'out', label: 'Out', type: 'any' as const }],
            config: {
              baseUrl: 'https://{{env.API_HOST}}/v1/query',
              authHeader: 'Bearer {{env.API_KEY}}',
              timeout: 5000,
            },
          },
        },
      ],
      edges: [],
    };

    it('detects all required environment variables in {{env.VAR}} format', () => {
      const detected = detectRequiredEnvVars(sampleWorkflow);
      expect(detected).toEqual(['API_HOST', 'API_KEY', 'ENVIRONMENT_NAME']);
    });

    it('validates workflow environment dictionary and catches missing variables', () => {
      const partialEnv = {
        API_HOST: 'api.production.internal',
      };

      const result = validateWorkflowEnvironment(sampleWorkflow, partialEnv);
      expect(result.isValid).toBe(false);
      expect(result.missingVars).toEqual(['API_KEY', 'ENVIRONMENT_NAME']);
      expect(result.presentVars).toEqual(['API_HOST']);
    });

    it('interpolates workflow environment variables safely', () => {
      const fullEnv = {
        ENVIRONMENT_NAME: 'Production',
        API_HOST: 'api.production.internal',
        API_KEY: 'secret-prod-token',
      };

      const interpolated = interpolateWorkflowEnvironment(sampleWorkflow, fullEnv);
      const node = interpolated.nodes[0];
      expect(node.data.label).toBe('Trigger Production');
      expect((node.data.config as any).baseUrl).toBe('https://api.production.internal/v1/query');
      expect((node.data.config as any).authHeader).toBe('Bearer secret-prod-token');
      expect((node.data.config as any).timeout).toBe(5000); // Numbers preserved
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 3. CLI Configuration, Masking, and Local Storage
   * ───────────────────────────────────────────────────────────── */
  describe('3. CLI Configuration & Token Masking', () => {
    it('masks tokens safely for logs and status displays', () => {
      expect(maskToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef123456')).toBe('eyJh...3456');
      expect(maskToken('short')).toBe('****');
      expect(maskToken(undefined)).toBe('(not set)');
      expect(maskToken('')).toBe('(not set)');
    });

    it('saves and loads CLI configuration accurately from file', () => {
      const testConfigPath = path.join(tempDir, 'cli-config.json');
      const testConfig: CliConfigFile = {
        apiUrl: 'http://localhost:3000',
        token: 'test-jwt-token-xyz',
        defaultWorkspace: 'test-workspace-id',
      };

      saveCliConfig(testConfig, testConfigPath);
      expect(fs.existsSync(testConfigPath)).toBe(true);

      const loaded = loadCliConfig(testConfigPath);
      expect(loaded.apiUrl).toBe('http://localhost:3000');
      expect(loaded.token).toBe('test-jwt-token-xyz');
      expect(loaded.activeWorkspaceId).toBe('test-workspace-id');
    });

    it('resolves effective config with proper precedence (flags > env > file > defaults)', () => {
      const testConfigPath = path.join(tempDir, 'cli-config.json');
      saveCliConfig(
        {
          apiUrl: 'http://file-config-url:3000',
          token: 'file-token',
          defaultWorkspace: 'file-workspace',
        },
        testConfigPath
      );

      // 1. Without flags or env, loads file values
      const fromFile = getEffectiveCliConfig({}, testConfigPath);
      expect(fromFile.apiUrl).toBe('http://file-config-url:3000');
      expect(fromFile.token).toBe('file-token');
      expect(fromFile.workspaceId).toBe('file-workspace');

      // 2. Flags override file config
      const withFlags = getEffectiveCliConfig(
        {
          url: 'https://flag-override-url.com',
          workspace: 'flag-workspace-id',
        },
        testConfigPath
      );
      expect(withFlags.apiUrl).toBe('https://flag-override-url.com');
      expect(withFlags.token).toBe('file-token');
      expect(withFlags.workspaceId).toBe('flag-workspace-id');
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 4. CLI Argument Parsing & Commands
   * ───────────────────────────────────────────────────────────── */
  describe('4. CLI Argument Parsing & Commands', () => {
    it('parses valid CLI commands and options', () => {
      const parsedList = parseArgs(['workflow', 'list', '--workspace', 'ws-123', '--json']);
      expect(parsedList.fullCommand).toBe('workflow list');
      expect(parsedList.command).toBe('workflow');
      expect(parsedList.subcommand).toBe('list');
      expect(parsedList.options.workspace).toBe('ws-123');
      expect(parsedList.options.json).toBe(true);

      const parsedPush = parseArgs([
        'workflow',
        'push',
        'my-workflow.json',
        '--workspace',
        'ws-456',
        '--overwrite',
      ]);
      expect(parsedPush.fullCommand).toBe('workflow push');
      expect(parsedPush.command).toBe('workflow');
      expect(parsedPush.subcommand).toBe('push');
      expect(parsedPush.args).toEqual(['my-workflow.json']);
      expect(parsedPush.options.workspace).toBe('ws-456');
      expect(parsedPush.options.overwrite).toBe(true);
    });

    it('workflow validate CLI command reports success on valid workflow file', async () => {
      const wfFilePath = path.join(tempDir, 'valid-wf.json');
      const validWorkflow = {
        id: 'wf-cli-val',
        name: 'Valid CLI Workflow',
        nodes: [
          {
            id: 'n1',
            type: 'workflowNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Trigger',
              type: 'manual-trigger',
              category: 'trigger',
              inputs: [],
              outputs: [{ id: 'out', label: 'Out', type: 'any' }],
              config: {},
            },
          },
        ],
        edges: [],
      };
      fs.writeFileSync(wfFilePath, JSON.stringify(validWorkflow, null, 2), 'utf-8');

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        await workflowValidateCommand(wfFilePath, { json: true });
        const jsonOutput = JSON.parse(logs[logs.length - 1]);
        expect(jsonOutput.isValid).toBe(true);
        expect(jsonOutput.nodeCount).toBe(1);
      } finally {
        console.log = originalLog;
      }
    });

    it('workflow validate CLI command catches missing environment variables with --env', async () => {
      const wfFilePath = path.join(tempDir, 'env-wf.json');
      const envWf = {
        id: 'wf-env',
        name: 'Env Workflow',
        nodes: [
          {
            id: 'n1',
            type: 'workflowNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Trigger',
              type: 'manual-trigger',
              category: 'trigger',
              inputs: [],
              outputs: [{ id: 'out', label: 'Out', type: 'any' }],
              config: { secret: '{{env.MISSING_SECRET}}' },
            },
          },
        ],
        edges: [],
      };
      fs.writeFileSync(wfFilePath, JSON.stringify(envWf, null, 2), 'utf-8');

      const envFilePath = path.join(tempDir, '.env.json');
      fs.writeFileSync(envFilePath, JSON.stringify({ OTHER_KEY: 'foo' }), 'utf-8');

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        await expect(
          workflowValidateCommand(wfFilePath, { env: envFilePath, json: true })
        ).rejects.toThrow('Environment validation failed');

        const jsonOutput = JSON.parse(logs[logs.length - 1]);
        expect(jsonOutput.isValid).toBe(false);
        expect(jsonOutput.missingEnvVars).toContain('MISSING_SECRET');
      } finally {
        console.log = originalLog;
      }
    });

    it('workflow export CLI command sanitizes and writes valid workflow output', async () => {
      const exportDestPath = path.join(tempDir, 'exported.json');
      const wf = {
        id: 'wf-export-test',
        name: 'Export Test Workflow',
        nodes: [
          {
            id: 'n1',
            type: 'workflowNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Trigger',
              type: 'manual-trigger',
              category: 'trigger',
              inputs: [],
              outputs: [{ id: 'out', label: 'Out', type: 'any' }],
              config: {},
            },
          },
        ],
        edges: [],
      };

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          workflow: {
            id: 'wf-export-test',
            name: 'Export Test Workflow',
            definition: wf,
          },
        }),
      };

      await workflowExportCommand(
        'wf-export-test',
        { workspace: mockWorkspaceId, output: exportDestPath },
        mockClient as any
      );
      expect(fs.existsSync(exportDestPath)).toBe(true);

      const exportedContent = JSON.parse(fs.readFileSync(exportDestPath, 'utf-8'));
      expect(exportedContent.name).toBe('Export Test Workflow');
    });

    it('workflow push CLI command enforces overwrite protection when a workflow exists', async () => {
      const wfFilePath = path.join(tempDir, 'push-wf.json');
      const existingWfId = 'wf-existing-id';
      const wfData = {
        id: existingWfId,
        name: 'Existing Workflow',
        nodes: [
          {
            id: 'n1',
            type: 'workflowNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Trigger',
              type: 'manual-trigger',
              category: 'trigger',
              inputs: [],
              outputs: [{ id: 'out', label: 'Out', type: 'any' }],
              config: {},
            },
          },
        ],
        edges: [],
      };
      fs.writeFileSync(wfFilePath, JSON.stringify(wfData), 'utf-8');

      // Create a mock client
      const mockClient = {
        request: vi.fn().mockImplementation((reqPath: string, opts: any = {}) => {
          if (reqPath.endsWith('/workflows') && (!opts.method || opts.method === 'GET')) {
            return Promise.resolve({
              workflows: [{ id: existingWfId, name: 'Existing Workflow' }],
            });
          }
          if (opts.method === 'PUT') {
            return Promise.resolve({ id: existingWfId, name: 'Existing Workflow' });
          }
          return Promise.resolve({});
        }),
      };

      // Fails without --overwrite
      await expect(
        workflowPushCommand(wfFilePath, { workspace: mockWorkspaceId }, mockClient as any)
      ).rejects.toThrow(/already exists in workspace/);

      // Succeeds with --overwrite
      await expect(
        workflowPushCommand(
          wfFilePath,
          { workspace: mockWorkspaceId, overwrite: true },
          mockClient as any
        )
      ).resolves.not.toThrow();

      expect(mockClient.request).toHaveBeenCalledWith(
        `/api/workspaces/${mockWorkspaceId}/workflows/${existingWfId}`,
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 5. Fastify Template API Routes & Workspace RBAC
   * ───────────────────────────────────────────────────────────── */
  describe('5. Fastify Template API Routes & Workspace RBAC', () => {
    let app: FastifyInstance;
    let mockUserRole: 'admin' | 'developer' | 'viewer' = 'developer';
    const mockDbTemplates: any[] = [];

    beforeEach(async () => {
      mockDbTemplates.length = 0;
      mockUserRole = 'developer';

      vi.spyOn(supabaseModule, 'verifyAccessToken').mockImplementation(async (token: string) => {
        if (token === 'valid-user-jwt') {
          return {
            user: {
              id: mockUserId,
              email: 'developer@example.com',
              user_metadata: {},
              app_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as any,
            error: null,
          };
        }
        return { user: null, error: 'Invalid or expired authentication token' };
      });

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'workspace_members') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: { role: mockUserRole, user_id: mockUserId },
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          if (table === 'workflow_templates') {
            return {
              select: () => ({
                eq: (_col: string, val: string) => ({
                  order: () =>
                    Promise.resolve({
                      data: mockDbTemplates.filter((t) => t.workspace_id === val),
                      error: null,
                    }),
                }),
              }),
              insert: (record: any) => ({
                select: () => ({
                  single: () => {
                    const row = {
                      id: mockTemplateId,
                      workspace_id: record.workspace_id,
                      name: record.name,
                      description: record.description,
                      category: record.category,
                      nodes: record.nodes,
                      edges: record.edges,
                      required_env_vars: record.required_env_vars || [],
                      created_by: mockUserId,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    mockDbTemplates.push(row);
                    return Promise.resolve({ data: row, error: null });
                  },
                }),
              }),
              delete: () => ({
                eq: (_c1: string, templateId: string) => ({
                  eq: (_c2: string, workspaceId: string) => {
                    const idx = mockDbTemplates.findIndex(
                      (t) => t.id === templateId && t.workspace_id === workspaceId
                    );
                    if (idx >= 0) mockDbTemplates.splice(idx, 1);
                    return Promise.resolve({ error: null });
                  },
                }),
              }),
            };
          }
          return { select: vi.fn() };
        },
      } as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);

      app = await buildApp({
        configOverride: { NODE_ENV: 'test', RATE_LIMIT_MAX: 1000 },
        loggerOverride: false,
      });
    });

    it('GET /api/workspaces/:workspaceId/templates returns starters + workspace templates', async () => {
      mockDbTemplates.push({
        id: '12345678-1234-1234-1234-123456789012',
        workspace_id: mockWorkspaceId,
        name: 'Custom Team Pipeline',
        description: 'Private team template',
        category: 'automation',
        definition: { nodes: [], edges: [] },
        required_env_vars: ['CUSTOM_VAR'],
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${mockWorkspaceId}/templates`,
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.templates).toBeDefined();

      // Must include starter templates (at least 5)
      const starters = body.templates.filter((t: any) => !t.isWorkspaceTemplate);
      expect(starters.length).toBe(5);

      // Must include workspace template
      const custom = body.templates.find(
        (t: any) => t.id === '12345678-1234-1234-1234-123456789012'
      );
      expect(custom).toBeDefined();
      expect(custom.name).toBe('Custom Team Pipeline');
      expect(custom.isWorkspaceTemplate).toBe(true);
    });

    it('POST /api/workspaces/:workspaceId/templates allows editors to create private template', async () => {
      mockUserRole = 'developer';

      const validTemplatePayload = {
        name: 'New Workspace Template',
        description: 'Team workflow blueprint',
        category: 'data',
        definition: {
          nodes: [
            {
              id: 'n1',
              type: 'workflowNode',
              position: { x: 0, y: 0 },
              data: {
                label: 'Trigger',
                type: 'manual-trigger',
                category: 'trigger',
                inputs: [],
                outputs: [{ id: 'out', label: 'Out', type: 'any' }],
                config: {},
              },
            },
          ],
          edges: [],
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${mockWorkspaceId}/templates`,
        headers: { authorization: 'Bearer valid-user-jwt' },
        payload: validTemplatePayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.template.id).toBe(mockTemplateId);
      expect(body.template.name).toBe('New Workspace Template');
      expect(body.template.workspaceId).toBe(mockWorkspaceId);
    });

    it('POST /api/workspaces/:workspaceId/templates rejects viewer with 403 Forbidden', async () => {
      mockUserRole = 'viewer';

      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${mockWorkspaceId}/templates`,
        headers: { authorization: 'Bearer valid-user-jwt' },
        payload: {
          name: 'Forbidden Template',
          description: 'Cannot be created by viewer',
          category: 'general',
          definition: {
            nodes: [],
            edges: [],
          },
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/workspaces/:workspaceId/templates/:templateId rejects invalid non-uuid starter template ID', async () => {
      mockUserRole = 'admin';

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${mockWorkspaceId}/templates/manual-transform-console`,
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/must be valid UUID/i);
    });

    it('POST /api/workspaces/:workspaceId/templates/validate validates template structure without saving', async () => {
      const invalidPayload = {
        name: 'Incomplete Template',
        category: 'invalid-category',
        definition: {
          nodes: [],
          edges: [],
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${mockWorkspaceId}/templates/validate`,
        headers: { authorization: 'Bearer valid-user-jwt' },
        payload: invalidPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.validation.isValid).toBe(false);
      expect(body.validation.errors.length).toBeGreaterThan(0);
    });
  });
});
