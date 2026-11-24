import type { BaseWorkflowNode, BaseWorkflowEdge } from '@flowforge/workflow-schema';
import type { NodeExecutionRecord } from '@flowforge/node-sdk';
import type { EngineRunOptions, ReplayPartition } from './types';

/**
 * Computes all downstream node IDs reachable from targetNodeId using BFS.
 * The targetNodeId itself is included in the returned set.
 */
export function findDownstreamNodeIds<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge
>(
  _nodes: TNode[],
  edges: TEdge[],
  targetNodeId: string
): Set<string> {
  const downstream = new Set<string>();
  downstream.add(targetNodeId);

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) || [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const queue: string[] = [targetNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = adjacency.get(current) || [];
    for (const t of targets) {
      if (!downstream.has(t)) {
        downstream.add(t);
        queue.push(t);
      }
    }
  }

  return downstream;
}

/**
 * Partitions workflow nodes into:
 * - reusedNodeIds: upstream/non-downstream nodes that have historical outputs.
 * - reexecutedNodeIds: targetNodeId and all reachable downstream nodes.
 */
export function partitionWorkflowForReplay<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge
>(
  nodes: TNode[],
  edges: TEdge[],
  targetNodeId: string,
  originalRecords: Record<string, NodeExecutionRecord>
): ReplayPartition {
  const targetExists = nodes.some((n) => n.id === targetNodeId);
  if (!targetExists) {
    throw new Error(`Target node "${targetNodeId}" does not exist in workflow definition.`);
  }

  const downstreamSet = findDownstreamNodeIds(nodes, edges, targetNodeId);
  const reusedNodeIds: string[] = [];
  const reexecutedNodeIds: string[] = [];

  for (const node of nodes) {
    if (downstreamSet.has(node.id)) {
      reexecutedNodeIds.push(node.id);
    } else {
      const rec = originalRecords[node.id];
      // Only reuse if historical record was successful and has output
      if (rec && rec.state === 'success') {
        reusedNodeIds.push(node.id);
      } else {
        // If an upstream node didn't succeed previously or has no record,
        // it must be executed or flagged
        reexecutedNodeIds.push(node.id);
      }
    }
  }

  return {
    targetNodeId,
    reusedNodeIds,
    reexecutedNodeIds,
    downstreamNodeIds: Array.from(downstreamSet),
  };
}

export interface BuildReplayOptionsParams {
  replayedFromExecutionId: string;
  targetNodeId: string;
  partition: ReplayPartition;
  originalRecords: Record<string, NodeExecutionRecord>;
  editedInput?: Record<string, unknown>;
  safeReplayMode?: boolean;
  baseOptions?: EngineRunOptions;
}

/**
 * Prepares the EngineRunOptions for replaying an execution from targetNodeId.
 */
export function buildReplayEngineOptions(params: BuildReplayOptionsParams): EngineRunOptions {
  const {
    replayedFromExecutionId,
    targetNodeId,
    partition,
    originalRecords,
    editedInput,
    safeReplayMode = true,
    baseOptions = {},
  } = params;

  const reusedRecords: Record<string, NodeExecutionRecord> = {};
  for (const id of partition.reusedNodeIds) {
    const orig = originalRecords[id];
    if (orig) {
      reusedRecords[id] = {
        ...orig,
        state: 'success',
        isReused: true,
      };
    }
  }

  const editedNodeInputs: Record<string, Record<string, unknown>> = {};
  if (editedInput && Object.keys(editedInput).length > 0) {
    editedNodeInputs[targetNodeId] = editedInput;
  }

  return {
    ...baseOptions,
    replayFromNodeId: targetNodeId,
    replayedFromExecutionId,
    reusedNodeRecords: reusedRecords,
    editedNodeInputs,
    safeReplayMode,
    originalNodeRecords: originalRecords,
  };
}
