import { z } from 'zod';
import { workflowImportSchema } from './import';
import type { SavedWorkflow } from './workflow';

export const workflowTemplateCategorySchema = z.enum([
  'general',
  'integration',
  'automation',
  'data',
  'error-handling',
]);
export type WorkflowTemplateCategory = z.infer<typeof workflowTemplateCategorySchema>;

export const workflowTemplateSchema = z.object({
  id: z.string().min(1, 'Template ID is required'),
  name: z.string().min(1, 'Template name is required'),
  description: z.string().default(''),
  category: workflowTemplateCategorySchema.default('general'),
  icon: z.string().default('Workflow'),
  color: z.string().default('#6366f1'),
  requiredConfig: z.array(z.string()).default([]),
  requiredEnvVars: z.array(z.string()).default([]),
  definition: workflowImportSchema,
  isWorkspaceTemplate: z.boolean().default(false),
  workspaceId: z.string().uuid().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;

export interface TemplateValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  edgeCount: number;
  nodeTypes: string[];
  requiredConfig: string[];
  requiredEnvVars: string[];
}

/**
 * Valid node types supported across FlowForge.
 */
export const KNOWN_NODE_TYPES = new Set([
  'manual-trigger',
  'webhook-trigger',
  'schedule-trigger',
  'http-request',
  'webhook-response',
  'condition',
  'set-data',
  'filter-data',
  'map-data',
  'merge-data',
  'json-parse',
  'json-stringify',
  'string-operations',
  'math-operations',
  'date-time',
  'console-output',
  'delay',
]);

/**
 * Validates a workflow template against schema, node types, graph cycles, and secret leakage.
 */
export function validateWorkflowTemplate(template: unknown): TemplateValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requiredConfig: string[] = [];
  const requiredEnvVars = new Set<string>();
  const nodeTypes = new Set<string>();

  const parseResult = workflowTemplateSchema.safeParse(template);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return {
      isValid: false,
      errors,
      warnings,
      nodeCount: 0,
      edgeCount: 0,
      nodeTypes: [],
      requiredConfig: [],
      requiredEnvVars: [],
    };
  }

  const tpl = parseResult.data;
  const nodes = tpl.definition.nodes;
  const edges = tpl.definition.edges;

  if (nodes.length === 0) {
    errors.push('Template definition must contain at least one node.');
  }

  const nodeIds = new Set<string>();
  let hasTrigger = false;

  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID "${node.id}" detected in template.`);
    }
    nodeIds.add(node.id);

    const type = node.data.type;
    nodeTypes.add(type);
    if (!KNOWN_NODE_TYPES.has(type)) {
      errors.push(`Unknown/unrecognized node type "${type}" in node "${node.data.label || node.id}".`);
    }

    if (node.data.category === 'trigger') {
      hasTrigger = true;
    }

    // Inspect config for environment variables and secrets
    const configStr = JSON.stringify(node.data.config || {});

    // Detect {{env.VAR_NAME}}
    const envMatches = configStr.matchAll(/\{\{env\.([A-Za-z0-9_]+)\}\}/g);
    for (const match of envMatches) {
      requiredEnvVars.add(match[1]);
    }

    // Detect secrets or private credentials
    if (/sk_live_[0-9a-zA-Z]{20,}/.test(configStr)) {
      errors.push(`Potential live production secret detected in node "${node.data.label || node.id}".`);
    }
    if (/Bearer\s+[A-Za-z0-9\-_]{25,}/i.test(configStr)) {
      errors.push(`Potential hardcoded authorization token in node "${node.data.label || node.id}".`);
    }
    if (/password['"]?\s*:\s*['"][^'"]+['"]/i.test(configStr)) {
      warnings.push(`Hardcoded password field observed in node "${node.data.label || node.id}".`);
    }
  }

  // Validate edges
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge "${edge.id}" has invalid source node "${edge.source}".`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge "${edge.id}" has invalid target node "${edge.target}".`);
    }
  }

  // Check for graph cycles
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  let visitedCount = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    visitedCount++;
    for (const neighbor of adjacency.get(cur) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  if (!hasTrigger && nodes.length > 0) {
    errors.push('Template workflow definition must contain at least one trigger node.');
  }

  if (visitedCount < nodeIds.size) {
    errors.push('Cyclic dependency loop (cycle) detected in template workflow graph.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes: Array.from(nodeTypes),
    requiredConfig: tpl.requiredConfig || requiredConfig,
    requiredEnvVars: Array.from(requiredEnvVars),
  };
}

/* ── 5 Built-in Starter Templates ───────────────────────────────────── */
export const STARTER_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  /* 1. Manual Trigger → Transform Data → Console Output */
  {
    id: 'tpl-starter-transform',
    name: 'User Onboarding & Data Normalization',
    description: 'Receives user profile payload, normalizes fields with Set Data, and logs the result.',
    category: 'data',
    icon: 'Play',
    color: '#10b981',
    requiredConfig: ['Manual trigger JSON payload', 'Target property mapping in Set Data'],
    requiredEnvVars: [],
    isWorkspaceTemplate: false,
    definition: {
      id: 'wf-tpl-starter-transform',
      name: 'User Onboarding & Data Normalization',
      nodes: [
        {
          id: 'node-start',
          type: 'workflowNode',
          position: { x: 100, y: 150 },
          data: {
            label: 'User Signup Trigger',
            type: 'manual-trigger',
            category: 'trigger',
            description: 'Receives raw signup JSON',
            icon: 'Play',
            color: '#10b981',
            config: {
              payload: JSON.stringify(
                {
                  userId: 'usr_101',
                  email: 'JANE.DOE@EXAMPLE.COM',
                  firstName: 'Jane',
                  lastName: 'Doe',
                },
                null,
                2
              ),
            },
            inputs: [],
            outputs: [{ id: 'output', label: 'Payload', type: 'any' }],
          },
        },
        {
          id: 'node-transform',
          type: 'workflowNode',
          position: { x: 400, y: 150 },
          data: {
            label: 'Normalize Profile',
            type: 'set-data',
            category: 'data',
            description: 'Adds normalized email and default tier',
            icon: 'Layers',
            color: '#3b82f6',
            config: {
              fields: [
                { key: 'accountTier', value: 'starter', valueType: 'string' },
                { key: 'isVerified', value: 'false', valueType: 'boolean' },
              ],
              mergeWithIncoming: true,
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-log',
          type: 'workflowNode',
          position: { x: 700, y: 150 },
          data: {
            label: 'Log Normalized Profile',
            type: 'console-output',
            category: 'utility',
            description: 'Logs result to console',
            icon: 'Terminal',
            color: '#6b7280',
            config: {
              level: 'info',
              prefix: '[Onboarding Normalized]',
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'node-start', target: 'node-transform' },
        { id: 'edge-2', source: 'node-transform', target: 'node-log' },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  },

  /* 2. HTTP Request → Condition → Console Output */
  {
    id: 'tpl-http-condition',
    name: 'HTTP Health Check & Branch Alerting',
    description: 'Polls an external HTTP endpoint and branches execution into success or failure alerts.',
    category: 'integration',
    icon: 'Globe',
    color: '#06b6d4',
    requiredConfig: ['Target health endpoint URL', 'Expected status code condition'],
    requiredEnvVars: [],
    isWorkspaceTemplate: false,
    definition: {
      id: 'wf-tpl-http-condition',
      name: 'HTTP Health Check & Branch Alerting',
      nodes: [
        {
          id: 'node-trigger',
          type: 'workflowNode',
          position: { x: 100, y: 200 },
          data: {
            label: 'Check Trigger',
            type: 'manual-trigger',
            category: 'trigger',
            description: 'Starts health check',
            icon: 'Play',
            color: '#10b981',
            config: { payload: '{"service": "payment-gateway"}' },
            inputs: [],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-http',
          type: 'workflowNode',
          position: { x: 380, y: 200 },
          data: {
            label: 'Query Service Status',
            type: 'http-request',
            category: 'data',
            description: 'Queries API endpoint',
            icon: 'Globe',
            color: '#06b6d4',
            config: {
              url: 'https://httpbin.org/status/200',
              method: 'GET',
              timeoutMs: 5000,
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-cond',
          type: 'workflowNode',
          position: { x: 680, y: 200 },
          data: {
            label: 'Evaluate HTTP Status',
            type: 'condition',
            category: 'logic',
            description: 'Checks if status == 200',
            icon: 'GitFork',
            color: '#f59e0b',
            config: {
              conditions: [
                {
                  field: 'status',
                  operator: 'equals',
                  value: 200,
                },
              ],
              logicalOperator: 'and',
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [
              { id: 'true', label: 'True', type: 'any' },
              { id: 'false', label: 'False', type: 'any' },
            ],
          },
        },
        {
          id: 'node-log-ok',
          type: 'workflowNode',
          position: { x: 980, y: 120 },
          data: {
            label: 'Service Healthy Log',
            type: 'console-output',
            category: 'utility',
            description: 'Logs healthy service',
            icon: 'CheckCircle2',
            color: '#10b981',
            config: { level: 'info', prefix: '[HEALTHY]' },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-log-fail',
          type: 'workflowNode',
          position: { x: 980, y: 280 },
          data: {
            label: 'Outage Alert Log',
            type: 'console-output',
            category: 'utility',
            description: 'Logs outage alert',
            icon: 'AlertTriangle',
            color: '#ef4444',
            config: { level: 'error', prefix: '[OUTAGE ALERT]' },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-trigger', target: 'node-http' },
        { id: 'e2', source: 'node-http', target: 'node-cond' },
        { id: 'e3', source: 'node-cond', target: 'node-log-ok', sourceHandle: 'true' },
        { id: 'e4', source: 'node-cond', target: 'node-log-fail', sourceHandle: 'false' },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  },

  /* 3. Scheduled Workflow */
  {
    id: 'tpl-scheduled-poller',
    name: 'Scheduled Daily Metrics Poller',
    description: 'Triggers daily at 09:00 UTC, fetches metrics from a remote service, and outputs summary.',
    category: 'automation',
    icon: 'Calendar',
    color: '#8b5cf6',
    requiredConfig: ['Cron expression', 'Metrics target endpoint'],
    requiredEnvVars: [],
    isWorkspaceTemplate: false,
    definition: {
      id: 'wf-tpl-scheduled-poller',
      name: 'Scheduled Daily Metrics Poller',
      nodes: [
        {
          id: 'node-sched',
          type: 'workflowNode',
          position: { x: 100, y: 150 },
          data: {
            label: 'Daily 9AM Cron',
            type: 'schedule-trigger',
            category: 'trigger',
            description: 'Runs daily at 9am UTC',
            icon: 'Calendar',
            color: '#8b5cf6',
            config: {
              cron: '0 9 * * *',
              timezone: 'UTC',
              enabled: true,
              defaultPayload: '{"job": "daily-report"}',
            },
            inputs: [],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-fetch',
          type: 'workflowNode',
          position: { x: 420, y: 150 },
          data: {
            label: 'Fetch Metrics JSON',
            type: 'http-request',
            category: 'data',
            description: 'Queries reporting endpoint',
            icon: 'Globe',
            color: '#06b6d4',
            config: {
              url: 'https://httpbin.org/json',
              method: 'GET',
              timeoutMs: 8000,
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-output',
          type: 'workflowNode',
          position: { x: 740, y: 150 },
          data: {
            label: 'Output Metrics Log',
            type: 'console-output',
            category: 'utility',
            description: 'Logs metric payload',
            icon: 'Terminal',
            color: '#6b7280',
            config: { level: 'info', prefix: '[Metrics Report]' },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-sched', target: 'node-fetch' },
        { id: 'e2', source: 'node-fetch', target: 'node-output' },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  },

  /* 4. Data Validation Workflow */
  {
    id: 'tpl-webhook-lead-validation',
    name: 'Webhook Event Ingestion & Lead Validation',
    description: 'Receives webhook leads, filters qualified prospects with score threshold, and returns response.',
    category: 'data',
    icon: 'Webhook',
    color: '#10b981',
    requiredConfig: ['Webhook path', 'Filter condition score threshold'],
    requiredEnvVars: [],
    isWorkspaceTemplate: false,
    definition: {
      id: 'wf-tpl-webhook-lead-validation',
      name: 'Webhook Event Ingestion & Lead Validation',
      nodes: [
        {
          id: 'node-whk',
          type: 'workflowNode',
          position: { x: 100, y: 150 },
          data: {
            label: 'Lead Ingestion Webhook',
            type: 'webhook-trigger',
            category: 'trigger',
            description: 'Ingests prospective leads',
            icon: 'Webhook',
            color: '#059669',
            config: {
              path: 'lead-ingest',
              httpMethod: 'POST',
              authType: 'none',
              respondMode: 'immediate',
            },
            inputs: [],
            outputs: [{ id: 'output', label: 'Payload', type: 'object' }],
          },
        },
        {
          id: 'node-filter',
          type: 'workflowNode',
          position: { x: 420, y: 150 },
          data: {
            label: 'Filter Qualified (Score >= 50)',
            type: 'filter-data',
            category: 'data',
            description: 'Keeps leads with score >= 50',
            icon: 'Filter',
            color: '#3b82f6',
            config: {
              arrayPath: 'leads',
              filterMode: 'keep_matching',
              conditions: [
                {
                  field: 'score',
                  operator: 'greater_than_or_equal',
                  value: 50,
                },
              ],
              logicalOperator: 'and',
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-resp',
          type: 'workflowNode',
          position: { x: 740, y: 150 },
          data: {
            label: 'Send HTTP 200 Accepted',
            type: 'webhook-response',
            category: 'utility',
            description: 'Returns confirmation to caller',
            icon: 'Send',
            color: '#10b981',
            config: {
              statusCode: 200,
              responseBody: '{\n  "status": "accepted",\n  "message": "Lead ingested successfully"\n}',
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-whk', target: 'node-filter' },
        { id: 'e2', source: 'node-filter', target: 'node-resp' },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  },

  /* 5. Error-Handling / Fallback Example */
  {
    id: 'tpl-error-handling-fallback',
    name: 'Resilient Service Call with Fallback',
    description: 'Queries a primary API service and seamlessly injects cached fallback data on failure.',
    category: 'error-handling',
    icon: 'ShieldAlert',
    color: '#ef4444',
    requiredConfig: ['Primary service endpoint URL', 'Fallback default field mappings'],
    requiredEnvVars: [],
    isWorkspaceTemplate: false,
    definition: {
      id: 'wf-tpl-error-handling-fallback',
      name: 'Resilient Service Call with Fallback',
      nodes: [
        {
          id: 'node-start',
          type: 'workflowNode',
          position: { x: 100, y: 200 },
          data: {
            label: 'Request Trigger',
            type: 'manual-trigger',
            category: 'trigger',
            description: 'Trigger request',
            icon: 'Play',
            color: '#10b981',
            config: { payload: '{"itemId": "item_404"}' },
            inputs: [],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-req',
          type: 'workflowNode',
          position: { x: 380, y: 200 },
          data: {
            label: 'Call Primary API',
            type: 'http-request',
            category: 'data',
            description: 'Fetches item details',
            icon: 'Globe',
            color: '#06b6d4',
            config: {
              url: 'https://httpbin.org/status/200',
              method: 'GET',
              timeoutMs: 3000,
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-check',
          type: 'workflowNode',
          position: { x: 680, y: 200 },
          data: {
            label: 'Check If Request Succeeded',
            type: 'condition',
            category: 'logic',
            description: 'Checks status >= 200 and < 400',
            icon: 'GitFork',
            color: '#f59e0b',
            config: {
              conditions: [{ field: 'ok', operator: 'is_true', value: true }],
              logicalOperator: 'and',
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [
              { id: 'true', label: 'True', type: 'any' },
              { id: 'false', label: 'False', type: 'any' },
            ],
          },
        },
        {
          id: 'node-primary-success',
          type: 'workflowNode',
          position: { x: 980, y: 120 },
          data: {
            label: 'Process Live Result',
            type: 'set-data',
            category: 'data',
            description: 'Processes successful live response',
            icon: 'CheckCircle2',
            color: '#10b981',
            config: {
              fields: [{ key: 'dataSource', value: 'live-remote', valueType: 'string' }],
              mergeWithIncoming: true,
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
        {
          id: 'node-fallback-data',
          type: 'workflowNode',
          position: { x: 980, y: 280 },
          data: {
            label: 'Inject Degraded Fallback',
            type: 'set-data',
            category: 'data',
            description: 'Injects cached default response',
            icon: 'ShieldAlert',
            color: '#ef4444',
            config: {
              fields: [
                { key: 'dataSource', value: 'cached-fallback', valueType: 'string' },
                { key: 'status', value: 'degraded', valueType: 'string' },
              ],
              mergeWithIncoming: true,
            },
            inputs: [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-start', target: 'node-req' },
        { id: 'e2', source: 'node-req', target: 'node-check' },
        { id: 'e3', source: 'node-check', target: 'node-primary-success', sourceHandle: 'true' },
        { id: 'e4', source: 'node-check', target: 'node-fallback-data', sourceHandle: 'false' },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  },
];

/**
 * Creates a fresh workflow instance from a template with unique IDs.
 */
export function instantiateWorkflowFromTemplate(
  template: WorkflowTemplate,
  customName?: string
): SavedWorkflow {
  const newWorkflowId = `wf-${Date.now().toString(36)}`;
  const now = Date.now();

  // Create mapping of old node IDs to new unique node IDs
  const idMap = new Map<string, string>();
  template.definition.nodes.forEach((n, idx) => {
    idMap.set(n.id, `node-${Date.now()}-${idx + 1}`);
  });

  const clonedNodes = template.definition.nodes.map((n) => {
    const newId = idMap.get(n.id)!;
    return {
      ...JSON.parse(JSON.stringify(n)),
      id: newId,
      data: {
        ...JSON.parse(JSON.stringify(n.data)),
        status: 'idle',
      },
    };
  });

  const clonedEdges = template.definition.edges.map((e, idx) => ({
    ...JSON.parse(JSON.stringify(e)),
    id: `edge-${Date.now()}-${idx + 1}`,
    source: idMap.get(e.source) || e.source,
    target: idMap.get(e.target) || e.target,
  }));

  return {
    id: newWorkflowId,
    name: customName || template.name,
    nodes: clonedNodes,
    edges: clonedEdges,
    createdAt: now,
    updatedAt: now,
  };
}
