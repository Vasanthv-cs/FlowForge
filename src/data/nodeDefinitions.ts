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

  /* ── 1B. Webhook Trigger ────────────────────────── */
  {
    type: 'webhook-trigger',
    label: 'Webhook Trigger',
    category: 'trigger',
    description: 'Trigger workflow via incoming HTTP webhook with secret token or HMAC auth',
    icon: 'Webhook',
    color: '#059669', // dark emerald
    inputs: [],
    outputs: [{ id: 'output', label: 'Payload', type: 'object' }],
    defaultConfig: {
      path: 'whk_' + Math.random().toString(36).substring(2, 10),
      httpMethod: 'POST',
      authType: 'none',
      secret: '',
      headerName: 'X-Webhook-Secret',
      respondMode: 'immediate',
    },
  },

  /* ── 1C. Schedule Trigger ───────────────────────── */
  {
    type: 'schedule-trigger',
    label: 'Schedule Trigger',
    category: 'trigger',
    description: 'Trigger workflow periodically according to a cron schedule',
    icon: 'Calendar',
    color: '#14b8a6', // teal
    inputs: [],
    outputs: [{ id: 'output', label: 'Schedule Info', type: 'object' }],
    defaultConfig: {
      cron: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
      defaultPayload: '{\n  "source": "cron-scheduler"\n}',
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
      queryParams: {},
      body: '',
      timeoutMs: 5000,
    },
  },

  /* ── JSON Parse ─────────────────────────────────── */
  {
    type: 'json-parse',
    label: 'JSON Parse',
    category: 'data',
    description: 'Parse a JSON string into a structured JavaScript object',
    icon: 'FileJson',
    color: '#0ea5e9',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Parsed', type: 'object' }],
    defaultConfig: {
      inputPath: '',
      outputKey: 'parsed',
    },
  },

  /* ── JSON Stringify ─────────────────────────────── */
  {
    type: 'json-stringify',
    label: 'JSON Stringify',
    category: 'data',
    description: 'Serialize structured data into a formatted JSON string',
    icon: 'Braces',
    color: '#0284c7',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'String', type: 'string' }],
    defaultConfig: {
      inputPath: '',
      prettyPrint: false,
      indentSpaces: 2,
      outputKey: 'jsonString',
    },
  },

  /* ── Set Data ───────────────────────────────────── */
  {
    type: 'set-data',
    label: 'Set Data',
    category: 'data',
    description: 'Set, add, or overwrite specific fields with typed values',
    icon: 'Database',
    color: '#6366f1',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Data', type: 'object' }],
    defaultConfig: {
      fields: [{ key: 'status', value: 'processed', valueType: 'string' }],
      mergeWithIncoming: true,
    },
  },

  /* ── Merge Data ─────────────────────────────────── */
  {
    type: 'merge-data',
    label: 'Merge Data',
    category: 'data',
    description: 'Combine multiple data objects with deep or shallow merge strategies',
    icon: 'Merge',
    color: '#8b5cf6',
    inputs: [{ id: 'input', label: 'Primary Data', type: 'object' }],
    outputs: [{ id: 'output', label: 'Merged', type: 'object' }],
    defaultConfig: {
      strategy: 'deep',
      conflictResolution: 'overwrite',
      secondaryData: '{}',
    },
  },

  /* ── Filter Data ────────────────────────────────── */
  {
    type: 'filter-data',
    label: 'Filter Data',
    category: 'data',
    description: 'Filter arrays of objects based on comparison criteria',
    icon: 'Filter',
    color: '#ec4899',
    inputs: [{ id: 'input', label: 'Input Array', type: 'array' }],
    outputs: [{ id: 'output', label: 'Filtered', type: 'array' }],
    defaultConfig: {
      arrayPath: '',
      itemField: '',
      operator: 'equals',
      targetValue: '',
      outputKey: 'filtered',
    },
  },

  /* ── Map Data ───────────────────────────────────── */
  {
    type: 'map-data',
    label: 'Map Data',
    category: 'data',
    description: 'Transform arrays by picking and renaming item fields',
    icon: 'ListOrdered',
    color: '#f43f5e',
    inputs: [{ id: 'input', label: 'Input Array', type: 'array' }],
    outputs: [{ id: 'output', label: 'Mapped', type: 'array' }],
    defaultConfig: {
      arrayPath: '',
      mappings: [{ sourceField: 'id', targetField: 'userId' }],
      outputKey: 'mapped',
    },
  },

  /* ── String Operations ──────────────────────────── */
  {
    type: 'string-operations',
    label: 'String Operations',
    category: 'utility',
    description: 'Manipulate strings: trim, uppercase, lowercase, replace, split, or join',
    icon: 'Type',
    color: '#a855f7',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Result', type: 'any' }],
    defaultConfig: {
      operation: 'trim',
      inputPath: '',
      outputKey: 'result',
    },
  },

  /* ── Date & Time ────────────────────────────────── */
  {
    type: 'date-time',
    label: 'Date & Time',
    category: 'utility',
    description: 'Format dates, calculate time deltas, or fetch current timestamps',
    icon: 'CalendarDays',
    color: '#10b981',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Formatted Date', type: 'any' }],
    defaultConfig: {
      operation: 'current_timestamp',
      outputFormat: 'iso',
      outputKey: 'timestamp',
    },
  },

  /* ── Math Operations ────────────────────────────── */
  {
    type: 'math-operations',
    label: 'Math Operations',
    category: 'utility',
    description: 'Perform arithmetic calculations: add, subtract, multiply, divide, round, min, max',
    icon: 'Calculator',
    color: '#eab308',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Result', type: 'number' }],
    defaultConfig: {
      operation: 'add',
      leftOperand: '0',
      rightOperand: '0',
      outputKey: 'result',
    },
  },

  /* ── Webhook Response ───────────────────────────── */
  {
    type: 'webhook-response',
    label: 'Webhook Response',
    category: 'trigger',
    description: 'Return a custom HTTP response for synchronous webhook triggers',
    icon: 'ArrowRightLeft',
    color: '#065f46',
    inputs: [{ id: 'input', label: 'Payload', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response Sent', type: 'object' }],
    defaultConfig: {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{\n  "success": true\n}',
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
