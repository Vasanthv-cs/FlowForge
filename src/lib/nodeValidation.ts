import type { WorkflowNode, WorkflowEdge, ValidationError } from '@/types/workflow';
import {
  manualTriggerSchema,
  httpRequestSchema,
  transformDataSchema,
  conditionSchema,
  delaySchema,
  consoleOutputSchema,
} from '@/types/nodeConfigs';

/**
 * Validates a single node's configuration according to its custom type rules.
 */
export function validateNodeConfig(node: WorkflowNode): ValidationError[] {
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
export function validateWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
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
