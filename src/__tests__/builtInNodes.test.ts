import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@flowforge/node-sdk';
import { JsonParseExecutor } from '../engine/executors/JsonParseExecutor';
import { JsonStringifyExecutor } from '../engine/executors/JsonStringifyExecutor';
import { SetDataExecutor } from '../engine/executors/SetDataExecutor';
import { MergeDataExecutor } from '../engine/executors/MergeDataExecutor';
import { FilterDataExecutor } from '../engine/executors/FilterDataExecutor';
import { MapDataExecutor } from '../engine/executors/MapDataExecutor';
import { StringOperationsExecutor } from '../engine/executors/StringOperationsExecutor';
import { DateTimeExecutor } from '../engine/executors/DateTimeExecutor';
import { MathOperationsExecutor } from '../engine/executors/MathOperationsExecutor';
import { WebhookResponseExecutor } from '../engine/executors/WebhookResponseExecutor';
import { HttpRequestExecutor } from '../engine/executors/HttpRequestExecutor';
import { defaultNodeRegistry } from '../engine/registry';
import { serverNodeRegistry } from '../server/engine/serverRegistry';

function makeContext(
  type: string,
  config: Record<string, unknown>,
  incomingPayload: unknown = {}
): ExecutionContext {
  return {
    executionId: 'exec_test_123',
    workflowId: 'wf_test_123',
    node: {
      id: `node-${type}-1`,
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: type,
        type,
        category: 'data',
        description: `Test ${type}`,
        icon: 'Box',
        color: '#000',
        inputs: [],
        outputs: [],
        config,
      },
    } as unknown as ExecutionContext['node'],
    upstreamOutputs: {},
    incomingPayload: incomingPayload as Record<string, unknown>,
    emitLog: () => {},
  };
}

describe('Batch 12: Built-in Nodes & Integrations', () => {
  describe('Node Registries', () => {
    const requiredTypes = [
      'json-parse',
      'json-stringify',
      'set-data',
      'merge-data',
      'filter-data',
      'map-data',
      'string-operations',
      'date-time',
      'math-operations',
      'webhook-response',
    ];

    it('should register all 10 new node types in client DefaultNodeRegistry', () => {
      for (const type of requiredTypes) {
        expect(defaultNodeRegistry.hasExecutor(type)).toBe(true);
        expect(defaultNodeRegistry.getExecutor(type)).toBeDefined();
      }
    });

    it('should register all 10 new node types in ServerNodeRegistry', () => {
      for (const type of requiredTypes) {
        expect(serverNodeRegistry.hasExecutor(type)).toBe(true);
        expect(serverNodeRegistry.getExecutor(type)).toBeDefined();
      }
    });
  });

  describe('JSON Parse Executor', () => {
    const executor = new JsonParseExecutor();

    it('should parse JSON string from root payload', async () => {
      const ctx = makeContext(
        'json-parse',
        { inputPath: '', outputKey: 'parsed' },
        '{"name": "Alice", "age": 30, "admin": true}'
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        parsed: { name: 'Alice', age: 30, admin: true },
      });
    });

    it('should parse JSON string from a nested path', async () => {
      const ctx = makeContext(
        'json-parse',
        { inputPath: 'payload.raw', outputKey: 'result' },
        { payload: { raw: '{"token": "xyz123"}' } }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        result: { token: 'xyz123' },
      });
    });

    it('should fail with an informative error for invalid JSON text', async () => {
      const ctx = makeContext(
        'json-parse',
        { inputPath: '', outputKey: 'parsed' },
        'not a valid json { string }'
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON Parse error');
    });

    it('should reject empty string cleanly with error', async () => {
      const ctx = makeContext(
        'json-parse',
        { inputPath: '', outputKey: 'parsed' },
        ''
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot parse empty string');
    });
  });

  describe('JSON Stringify Executor', () => {
    const executor = new JsonStringifyExecutor();

    it('should serialize object to compact JSON string', async () => {
      const ctx = makeContext(
        'json-stringify',
        { inputPath: '', prettyPrint: false, indentSpaces: 2, outputKey: 'jsonString' },
        { id: 101, title: 'Item' }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        jsonString: '{"id":101,"title":"Item"}',
      });
    });

    it('should serialize object with pretty printing indentation', async () => {
      const ctx = makeContext(
        'json-stringify',
        { inputPath: 'data', prettyPrint: true, indentSpaces: 4, outputKey: 'formatted' },
        { data: { count: 5 } }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        formatted: '{\n    "count": 5\n}',
      });
    });
  });

  describe('Set Data Executor', () => {
    const executor = new SetDataExecutor();

    it('should set multiple typed fields and merge with incoming payload', async () => {
      const ctx = makeContext(
        'set-data',
        {
          fields: [
            { key: 'strVal', value: 'hello', valueType: 'string' },
            { key: 'numVal', value: '42.5', valueType: 'number' },
            { key: 'boolVal', value: 'true', valueType: 'boolean' },
            { key: 'jsonVal', value: '{"nested": 123}', valueType: 'json' },
          ],
          mergeWithIncoming: true,
        },
        { originalKey: 'persisted', score: 10 }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        originalKey: 'persisted',
        score: 10,
        strVal: 'hello',
        numVal: 42.5,
        boolVal: true,
        jsonVal: { nested: 123 },
      });
    });

    it('should discard incoming payload when mergeWithIncoming is false', async () => {
      const ctx = makeContext(
        'set-data',
        {
          fields: [{ key: 'brandNew', value: 'onlyThis', valueType: 'string' }],
          mergeWithIncoming: false,
        },
        { shouldDrop: true }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        brandNew: 'onlyThis',
      });
    });

    it('should fail cleanly on invalid JSON field value', async () => {
      const ctx = makeContext(
        'set-data',
        {
          fields: [{ key: 'badJson', value: '{corrupt', valueType: 'json' }],
          mergeWithIncoming: true,
        },
        {}
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Set Data error');
    });
  });

  describe('Merge Data Executor', () => {
    const executor = new MergeDataExecutor();

    it('should perform shallow merge with overwrite resolution', async () => {
      const ctx = makeContext(
        'merge-data',
        {
          strategy: 'shallow',
          conflictResolution: 'overwrite',
          secondaryData: '{"b": 99, "c": 3, "meta": {"tags": ["new"]}}',
        },
        { a: 1, b: 2, meta: { tags: ['old'] } }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        a: 1,
        b: 99,
        c: 3,
        meta: { tags: ['new'] },
      });
    });

    it('should perform deep merge preserving non-conflicting nested properties', async () => {
      const ctx = makeContext(
        'merge-data',
        {
          strategy: 'deep',
          conflictResolution: 'overwrite',
          secondaryData: '{"user": {"settings": {"theme": "light", "locale": "en"}}}',
        },
        { user: { name: 'Bob', settings: { theme: 'dark', notifications: true } } }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        user: {
          name: 'Bob',
          settings: {
            theme: 'light',
            notifications: true,
            locale: 'en',
          },
        },
      });
    });

    it('should respect keep_original conflict resolution', async () => {
      const ctx = makeContext(
        'merge-data',
        {
          strategy: 'shallow',
          conflictResolution: 'keep_original',
          secondaryData: '{"shared": "overwrite-attempt", "added": "new"}',
        },
        { existing: 'keep-me', shared: 'original' }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        existing: 'keep-me',
        shared: 'original',
        added: 'new',
      });
    });

    it('should throw error on key conflict when conflictResolution is "error"', async () => {
      const ctx = makeContext(
        'merge-data',
        {
          strategy: 'shallow',
          conflictResolution: 'error',
          secondaryData: '{"clash": 2}',
        },
        { clash: 1 }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Conflict detected on key "clash"');
    });
  });

  describe('Filter Data Executor', () => {
    const executor = new FilterDataExecutor();

    const sampleUsers = [
      { id: 1, name: 'Alice', status: 'active', score: 85 },
      { id: 2, name: 'Bob', status: 'inactive', score: 40 },
      { id: 3, name: 'Charlie', status: 'active', score: 92 },
      { id: 4, name: 'Dave', status: 'pending', score: 60 },
    ];

    it('should filter items by equality on a nested field', async () => {
      const ctx = makeContext(
        'filter-data',
        {
          arrayPath: 'data.users',
          itemField: 'status',
          operator: 'equals',
          targetValue: 'active',
          outputKey: 'activeUsers',
        },
        { data: { users: sampleUsers } }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      const active = (result.output as { activeUsers: typeof sampleUsers }).activeUsers;
      expect(active).toHaveLength(2);
      expect(active.map((u) => u.name)).toEqual(['Alice', 'Charlie']);
    });

    it('should filter items by numeric comparison (greater_than)', async () => {
      const ctx = makeContext(
        'filter-data',
        {
          arrayPath: '',
          itemField: 'score',
          operator: 'greater_than',
          targetValue: '70',
          outputKey: 'highScorers',
        },
        sampleUsers
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      const high = (result.output as { highScorers: typeof sampleUsers }).highScorers;
      expect(high).toHaveLength(2);
      expect(high.map((u) => u.name)).toEqual(['Alice', 'Charlie']);
    });

    it('should filter items by contains operator', async () => {
      const ctx = makeContext(
        'filter-data',
        {
          arrayPath: '',
          itemField: 'name',
          operator: 'contains',
          targetValue: 'li',
          outputKey: 'matched',
        },
        sampleUsers
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      const matched = (result.output as { matched: typeof sampleUsers }).matched;
      expect(matched.map((u) => u.name)).toEqual(['Alice', 'Charlie']);
    });

    it('should reject non-array inputs gracefully', async () => {
      const ctx = makeContext(
        'filter-data',
        {
          arrayPath: 'notAnArray',
          itemField: 'id',
          operator: 'equals',
          targetValue: '1',
          outputKey: 'filtered',
        },
        { notAnArray: 123 }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected an array');
    });
  });

  describe('Map Data Executor', () => {
    const executor = new MapDataExecutor();

    it('should project and rename fields across array items', async () => {
      const items = [
        { id: 'u_1', first_name: 'John', last_name: 'Doe', unused: 999 },
        { id: 'u_2', first_name: 'Jane', last_name: 'Smith', unused: 888 },
      ];
      const ctx = makeContext(
        'map-data',
        {
          arrayPath: 'list',
          mappings: [
            { sourceField: 'id', targetField: 'userId' },
            { sourceField: 'first_name', targetField: 'firstName' },
          ],
          outputKey: 'transformed',
        },
        { list: items }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        transformed: [
          { userId: 'u_1', firstName: 'John' },
          { userId: 'u_2', firstName: 'Jane' },
        ],
      });
    });

    it('should reject non-array inputs gracefully', async () => {
      const ctx = makeContext(
        'map-data',
        {
          arrayPath: '',
          mappings: [{ sourceField: 'a', targetField: 'b' }],
          outputKey: 'mapped',
        },
        'scalar string'
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected an array');
    });
  });

  describe('String Operations Executor', () => {
    const executor = new StringOperationsExecutor();

    it('should trim whitespace', async () => {
      const ctx = makeContext(
        'string-operations',
        { operation: 'trim', inputPath: 'text', outputKey: 'clean' },
        { text: '   padded string   ' }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ clean: 'padded string' });
    });

    it('should convert to uppercase and lowercase', async () => {
      const upperCtx = makeContext(
        'string-operations',
        { operation: 'uppercase', inputPath: '', outputKey: 'res' },
        'MixedCase'
      );
      const upper = await executor.execute(upperCtx);
      expect(upper.output).toEqual({ res: 'MIXEDCASE' });

      const lowerCtx = makeContext(
        'string-operations',
        { operation: 'lowercase', inputPath: '', outputKey: 'res' },
        'MixedCase'
      );
      const lower = await executor.execute(lowerCtx);
      expect(lower.output).toEqual({ res: 'mixedcase' });
    });

    it('should replace substring safely without ReDoS', async () => {
      const ctx = makeContext(
        'string-operations',
        {
          operation: 'replace',
          inputPath: '',
          findText: 'foo',
          replaceWith: 'bar',
          outputKey: 'replaced',
        },
        'Hello foo, welcome foo!'
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ replaced: 'Hello bar, welcome bar!' });
    });

    it('should split string into array', async () => {
      const ctx = makeContext(
        'string-operations',
        { operation: 'split', inputPath: '', separator: ',', outputKey: 'fruits' },
        'apple,banana,orange'
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ fruits: ['apple', 'banana', 'orange'] });
    });

    it('should join array into string', async () => {
      const ctx = makeContext(
        'string-operations',
        { operation: 'join', inputPath: '', separator: ' - ', outputKey: 'joined' },
        ['one', 'two', 'three']
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ joined: 'one - two - three' });
    });
  });

  describe('Date & Time Executor', () => {
    const executor = new DateTimeExecutor();

    it('should generate current timestamp in ISO format', async () => {
      const ctx = makeContext(
        'date-time',
        { operation: 'current_timestamp', outputFormat: 'iso', outputKey: 'ts' },
        {}
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      const ts = (result.output as { ts: string }).ts;
      expect(new Date(ts).toString()).not.toBe('Invalid Date');
    });

    it('should add time interval to existing date', async () => {
      const ctx = makeContext(
        'date-time',
        {
          operation: 'add',
          inputDate: 'created',
          amount: 5,
          unit: 'days',
          outputFormat: 'iso',
          outputKey: 'future',
        },
        { created: '2026-01-01T00:00:00.000Z' }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        future: '2026-01-06T00:00:00.000Z',
      });
    });

    it('should subtract time interval from existing date', async () => {
      const ctx = makeContext(
        'date-time',
        {
          operation: 'subtract',
          inputDate: 'created',
          amount: 2,
          unit: 'hours',
          outputFormat: 'iso',
          outputKey: 'past',
        },
        { created: '2026-01-10T12:00:00.000Z' }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        past: '2026-01-10T10:00:00.000Z',
      });
    });

    it('should format date to date_only', async () => {
      const ctx = makeContext(
        'date-time',
        {
          operation: 'format',
          inputDate: 'created',
          outputFormat: 'date_only',
          outputKey: 'day',
        },
        { created: '2026-11-24T18:45:30.000Z' }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ day: '2026-11-24' });
    });

    it('should fail with informative error on invalid date string', async () => {
      const ctx = makeContext(
        'date-time',
        { operation: 'format', inputDate: 'invalid-date-string', outputFormat: 'iso', outputKey: 'ts' },
        {}
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid date string');
    });
  });

  describe('Math Operations Executor', () => {
    const executor = new MathOperationsExecutor();

    it('should add numbers from payload properties', async () => {
      const ctx = makeContext(
        'math-operations',
        {
          operation: 'add',
          leftOperand: 'item.price',
          rightOperand: 'item.tax',
          outputKey: 'total',
        },
        { item: { price: 49.99, tax: 5.01 } }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ total: 55 });
    });

    it('should perform division safely', async () => {
      const ctx = makeContext(
        'math-operations',
        {
          operation: 'divide',
          leftOperand: '100',
          rightOperand: '4',
          outputKey: 'result',
        },
        {}
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 25 });
    });

    it('should throw an error on division by zero', async () => {
      const ctx = makeContext(
        'math-operations',
        {
          operation: 'divide',
          leftOperand: '50',
          rightOperand: '0',
          outputKey: 'result',
        },
        {}
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Division by zero is undefined.');
    });

    it('should round numbers to specified decimal places', async () => {
      const ctx = makeContext(
        'math-operations',
        {
          operation: 'round',
          leftOperand: 'val',
          precision: 2,
          outputKey: 'rounded',
        },
        { val: 3.14159265 }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ rounded: 3.14 });
    });

    it('should compute min and max correctly', async () => {
      const minCtx = makeContext(
        'math-operations',
        { operation: 'min', leftOperand: '10', rightOperand: '25', outputKey: 'min' },
        {}
      );
      const minRes = await executor.execute(minCtx);
      expect(minRes.output).toEqual({ min: 10 });

      const maxCtx = makeContext(
        'math-operations',
        { operation: 'max', leftOperand: '10', rightOperand: '25', outputKey: 'max' },
        {}
      );
      const maxRes = await executor.execute(maxCtx);
      expect(maxRes.output).toEqual({ max: 25 });
    });
  });

  describe('Webhook Response Executor', () => {
    const executor = new WebhookResponseExecutor();

    it('should format status code, custom headers, and body', async () => {
      const ctx = makeContext(
        'webhook-response',
        {
          statusCode: 201,
          headers: { 'X-Custom-Header': 'FlowForge-Test' },
          body: '{"created": true, "id": "123"}',
        },
        { test: true }
      );
      const result = await executor.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        _webhookResponse: true,
        statusCode: 201,
        headers: { 'X-Custom-Header': 'FlowForge-Test' },
        body: '{"created": true, "id": "123"}',
      });
    });
  });

  describe('HTTP Request Query Parameters', () => {
    it('should append query parameters to URL in client HttpRequestExecutor', async () => {
      const executor = new HttpRequestExecutor();
      let capturedUrl = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL | Request) => {
        capturedUrl = url.toString();
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        } as unknown as Response;
      }) as typeof fetch;

      try {
        const ctx = makeContext(
          'http-request',
          {
            method: 'GET',
            url: 'https://example.com/api/items',
            queryParams: { category: 'electronics', limit: '10' },
            headers: {},
            body: '',
            timeoutMs: 5000,
          },
          {}
        );
        await executor.execute(ctx);
        expect(capturedUrl).toBe('https://example.com/api/items?category=electronics&limit=10');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Chained Workflow Integration Pipeline', () => {
    it('should pass data through a chained pipeline: parse -> filter -> map -> math', async () => {
      // 1. Parse JSON string
      const parseExec = defaultNodeRegistry.getExecutor('json-parse');
      const parseCtx = makeContext(
        'json-parse',
        { inputPath: 'rawInventory', outputKey: 'parsed' },
        {
          rawInventory: JSON.stringify([
            { item: 'Widget A', stock: 15, unitCost: 10 },
            { item: 'Widget B', stock: 2, unitCost: 50 },
            { item: 'Widget C', stock: 25, unitCost: 8 },
          ]),
        }
      );
      const parseRes = await parseExec.execute(parseCtx);
      expect(parseRes.success).toBe(true);

      // 2. Filter data: only items with stock >= 10
      const filterExec = defaultNodeRegistry.getExecutor('filter-data');
      const filterCtx = makeContext(
        'filter-data',
        {
          arrayPath: 'parsed',
          itemField: 'stock',
          operator: 'greater_than',
          targetValue: '9',
          outputKey: 'bulkItems',
        },
        parseRes.output
      );
      const filterRes = await filterExec.execute(filterCtx);
      expect(filterRes.success).toBe(true);
      const bulkItems = (filterRes.output as { bulkItems: Array<{ item: string; stock: number }> }).bulkItems;
      expect(bulkItems).toHaveLength(2);

      // 3. Map data: project to { name, qty }
      const mapExec = defaultNodeRegistry.getExecutor('map-data');
      const mapCtx = makeContext(
        'map-data',
        {
          arrayPath: 'bulkItems',
          mappings: [
            { sourceField: 'item', targetField: 'name' },
            { sourceField: 'stock', targetField: 'qty' },
          ],
          outputKey: 'summary',
        },
        filterRes.output
      );
      const mapRes = await mapExec.execute(mapCtx);
      expect(mapRes.success).toBe(true);
      expect(mapRes.output).toEqual({
        summary: [
          { name: 'Widget A', qty: 15 },
          { name: 'Widget C', qty: 25 },
        ],
      });

      // 4. Math: calculate combined total quantity of the two items
      const mathExec = defaultNodeRegistry.getExecutor('math-operations');
      const mathCtx = makeContext(
        'math-operations',
        {
          operation: 'add',
          leftOperand: 'summary.0.qty',
          rightOperand: 'summary.1.qty',
          outputKey: 'totalBulkQty',
        },
        mapRes.output
      );
      const mathRes = await mathExec.execute(mathCtx);
      expect(mathRes.success).toBe(true);
      expect(mathRes.output).toEqual({ totalBulkQty: 40 });
    });
  });
});
