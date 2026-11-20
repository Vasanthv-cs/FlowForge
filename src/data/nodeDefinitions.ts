import type { NodeDefinition } from '@/types/workflow';

export const nodeDefinitions: NodeDefinition[] = [
  /* ── 1. Manual Trigger ─────────────────────────── */
  {
    type: 'manual-trigger',
    label: 'Manual Trigger',
    category: 'trigger',
    description: 'Starts workflow execution with manually supplied JSON data',
    icon: 'Play',
    color: '#10b981', // emerald
    inputs: [],
    outputs: [{ id: 'output', label: 'Payload', type: 'any' }],
    defaultConfig: {
      payload: '{\n  "message": "Hello from FlowForge",\n  "timestamp": 1700000000\n}',
    },
  },

  /* ── 2. HTTP Request ───────────────────────────── */
  {
    type: 'http-request',
    label: 'HTTP Request',
    category: 'data',
    description: 'Execute an HTTP/REST request with custom method, headers and body',
    icon: 'Globe',
    color: '#3b82f6', // blue
    inputs: [{ id: 'input', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'object' }],
    defaultConfig: {
      method: 'GET',
      url: 'https://api.github.com/zen',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '',
      timeoutMs: 5000,
    },
  },

  /* ── 3. Transform Data ─────────────────────────── */
  {
    type: 'transform-data',
    label: 'Transform Data',
    category: 'data',
    description: 'Extract nested JSON properties or format strings safely without eval',
    icon: 'Wand2',
    color: '#06b6d4', // cyan
    inputs: [{ id: 'input', label: 'Input Data', type: 'any' }],
    outputs: [{ id: 'output', label: 'Transformed', type: 'any' }],
    defaultConfig: {
      mode: 'property-path',
      propertyPath: 'data',
      outputKey: 'result',
    },
  },

  /* ── 4. Condition ──────────────────────────────── */
  {
    type: 'condition',
    label: 'Condition',
    category: 'logic',
    description: 'Evaluate a logical comparison to branch workflow into True and False paths',
    icon: 'GitBranch',
    color: '#f59e0b', // amber
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [
      { id: 'true', label: 'True', type: 'any' },
      { id: 'false', label: 'False', type: 'any' },
    ],
    defaultConfig: {
      leftOperand: 'status',
      operator: 'equals',
      rightOperand: 'active',
    },
  },

  /* ── 5. Delay ──────────────────────────────────── */
  {
    type: 'delay',
    label: 'Delay',
    category: 'utility',
    description: 'Pause execution for a specified duration in milliseconds (max 60s)',
    icon: 'Clock',
    color: '#8b5cf6', // violet
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Output', type: 'any' }],
    defaultConfig: {
      delayMs: 1000,
    },
  },

  /* ── 6. Console Output ─────────────────────────── */
  {
    type: 'console-output',
    label: 'Console Output',
    category: 'utility',
    description: 'Capture, inspect and print the received payload to workflow logs',
    icon: 'Terminal',
    color: '#ec4899', // pink/fuchsia
    inputs: [{ id: 'input', label: 'Data', type: 'any' }],
    outputs: [{ id: 'output', label: 'Passthrough', type: 'any' }],
    defaultConfig: {
      level: 'info',
      prefix: 'FLOWFORGE',
    },
  },
];

export const nodeCategories: { id: string; label: string; color: string; description: string }[] = [
  {
    id: 'trigger',
    label: 'Triggers',
    color: '#10b981',
    description: 'Initiate workflow execution',
  },
  {
    id: 'data',
    label: 'Data',
    color: '#3b82f6',
    description: 'Fetch, parse and transform data',
  },
  {
    id: 'logic',
    label: 'Logic',
    color: '#f59e0b',
    description: 'Branch and control flow execution',
  },
  {
    id: 'utility',
    label: 'Utility',
    color: '#8b5cf6',
    description: 'Delays, logs and debugging aids',
  },
];
