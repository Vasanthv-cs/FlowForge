import type {
  BaseWorkflowNode,
  BaseWorkflowEdge,
  ValidationError,
} from '@flowforge/workflow-schema';
import {
  manualTriggerSchema,
  webhookTriggerSchema,
  scheduleTriggerSchema,
  httpRequestSchema,
  transformDataSchema,
  conditionSchema,
  delaySchema,
  consoleOutputSchema,
  jsonParseSchema,
  jsonStringifySchema,
  setDataSchema,
  mergeDataSchema,
  filterDataSchema,
  mapDataSchema,
  stringOperationsSchema,
  dateTimeSchema,
  mathOperationsSchema,
  webhookResponseSchema,
} from '@flowforge/workflow-schema';

/**
 * Validates a single node's configuration according to its custom type rules.
 */
export function validateNodeConfig<TNode extends BaseWorkflowNode = BaseWorkflowNode>(
  node: TNode,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { type, label, config } = node.data;

  try {
    switch (type) {
      case 'manual-trigger': {
        const result = manualTriggerSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'webhook-trigger': {
        const result = webhookTriggerSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: `${issue.path.join('.')}: ${issue.message}`,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'schedule-trigger': {
        const result = scheduleTriggerSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: `${issue.path.join('.')}: ${issue.message}`,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'http-request': {
        const result = httpRequestSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: `${issue.path.join('.')}: ${issue.message}`,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'transform-data': {
        const result = transformDataSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'condition': {
        const result = conditionSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'delay': {
        const result = delaySchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'console-output': {
        const result = consoleOutputSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'json-parse': {
        const result = jsonParseSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'json-stringify': {
        const result = jsonStringifySchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'set-data': {
        const result = setDataSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'merge-data': {
        const result = mergeDataSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'filter-data': {
        const result = filterDataSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'map-data': {
        const result = mapDataSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'string-operations': {
        const result = stringOperationsSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'date-time': {
        const result = dateTimeSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'math-operations': {
        const result = mathOperationsSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      case 'webhook-response': {
        const result = webhookResponseSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            errors.push({
              id: `${node.id}-${issue.path.join('.')}`,
              nodeId: node.id,
              nodeLabel: label,
              message: issue.message,
              severity: 'error',
            });
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err: unknown) {
    errors.push({
      id: `${node.id}-unknown`,
      nodeId: node.id,
      nodeLabel: label,
      message: err instanceof Error ? err.message : 'Unknown validation failure',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validates the entire workflow graph:
 * - Empty graph detection
 * - Trigger requirement
 * - Orphan nodes detection
 * - Node-level configuration validation
 */
export function validateWorkflowGraph<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge,
>(
  nodes: TNode[],
  edges: TEdge[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Empty workflow
  if (nodes.length === 0) {
    errors.push({
      id: 'v-empty',
      message: 'Workflow has no nodes. Drag or add nodes to begin.',
      severity: 'error',
    });
    return errors;
  }

  // 2. Trigger check
  const triggerNodes = nodes.filter((n) => n.data.category === 'trigger');
  if (triggerNodes.length === 0) {
    errors.push({
      id: 'v-no-trigger',
      message: 'Workflow has no trigger node. Add a Manual Trigger to start execution.',
      severity: 'warning',
    });
  }

  // 3. Orphan nodes check
  for (const node of nodes) {
    const hasConnection = edges.some(
      (e) => e.source === node.id || e.target === node.id,
    );
    if (!hasConnection && nodes.length > 1) {
      errors.push({
        id: `v-orphan-${node.id}`,
        nodeId: node.id,
        nodeLabel: node.data.label,
        message: `"${node.data.label}" is disconnected from the workflow graph.`,
        severity: 'warning',
      });
    }
  }

  // 4. Per-node configuration check
  for (const node of nodes) {
    const nodeErrors = validateNodeConfig(node);
    errors.push(...nodeErrors);
  }

  return errors;
}
