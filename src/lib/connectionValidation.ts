import type { Connection } from '@xyflow/react';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';

export interface ConnectionValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates whether a proposed connection is valid.
 */
export function validateConnection(
  connection: Connection,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): ConnectionValidationResult {
  const { source, target, sourceHandle, targetHandle } = connection;

  // 1. Must have valid source and target IDs
  if (!source || !target) {
    return { isValid: false, reason: 'Invalid connection endpoints' };
  }

  // 2. Prevent self-connections
  if (source === target) {
    return { isValid: false, reason: 'Cannot connect a node to itself' };
  }

  // 3. Find source and target node objects
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  if (!sourceNode || !targetNode) {
    return { isValid: false, reason: 'Node not found in workflow graph' };
  }

  // 4. Triggers cannot have inputs (cannot be target)
  if (targetNode.data.category === 'trigger') {
    return {
      isValid: false,
      reason: 'Trigger nodes cannot receive inputs from other nodes',
    };
  }

  // 5. Prevent duplicate connections between identical source and target handles
  const isDuplicate = edges.some(
    (e) =>
      e.source === source &&
      e.target === target &&
      e.sourceHandle === (sourceHandle ?? null) &&
      e.targetHandle === (targetHandle ?? null),
  );

  if (isDuplicate) {
    return { isValid: false, reason: 'This connection already exists' };
  }

  return { isValid: true };
}
