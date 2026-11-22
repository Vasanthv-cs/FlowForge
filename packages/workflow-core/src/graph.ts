import type { BaseWorkflowNode, BaseWorkflowEdge } from '@flowforge/workflow-schema';
import type { GraphAnalysisResult } from './types';

/**
 * Analyzes the workflow graph:
 * - Detects missing nodes referenced by edges
 * - Detects directed cycles using Kahn's algorithm
 * - Computes topological sorting via Kahn's algorithm
 * - Resolves upstream dependencies and downstream dependents
 */
export function analyzeWorkflowGraph<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge,
>(
  nodes: TNode[],
  edges: TEdge[],
): GraphAnalysisResult {
  const nodeMap = new Map<string, TNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const missingNodes: string[] = [];
  const errors: string[] = [];

  // 1. Detect missing nodes in edges
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      missingNodes.push(edge.source);
      errors.push(`Edge "${edge.id}" references non-existent source node "${edge.source}".`);
    }
    if (!nodeMap.has(edge.target)) {
      missingNodes.push(edge.target);
      errors.push(`Edge "${edge.id}" references non-existent target node "${edge.target}".`);
    }
  }

  // Filter valid edges that connect existing nodes
  const validEdges = edges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
  );

  // 2. Build adjacency structures
  const inDegree: Record<string, number> = {};
  const dependencyMap: Record<string, string[]> = {}; // node -> its parents (sources)
  const dependentMap: Record<string, string[]> = {};  // node -> its children (targets)

  for (const node of nodes) {
    inDegree[node.id] = 0;
    dependencyMap[node.id] = [];
    dependentMap[node.id] = [];
  }

  for (const edge of validEdges) {
    inDegree[edge.target] = (inDegree[edge.target] ?? 0) + 1;
    dependencyMap[edge.target].push(edge.source);
    dependentMap[edge.source].push(edge.target);
  }

  // 3. Kahn's Topological Sorting Algorithm
  const queue: string[] = [];
  for (const node of nodes) {
    if (inDegree[node.id] === 0) {
      queue.push(node.id);
    }
  }

  const topologicalOrder: string[] = [];
  const inDegreeCopy = { ...inDegree };

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    topologicalOrder.push(currentId);

    const children = dependentMap[currentId] ?? [];
    for (const childId of children) {
      inDegreeCopy[childId]--;
      if (inDegreeCopy[childId] === 0) {
        queue.push(childId);
      }
    }
  }

  // 4. Cycle Detection Check
  const hasCycles = topologicalOrder.length !== nodes.length;
  let cycleNodes: string[] = [];

  if (hasCycles) {
    // Nodes that were never added to the topological order participate in or follow a cycle
    cycleNodes = nodes
      .map((n) => n.id)
      .filter((id) => inDegreeCopy[id] > 0);

    errors.push(
      `Cycle detected in workflow graph! Cyclic or unresolvable nodes: ${cycleNodes.join(', ')}`,
    );
  }

  // 5. Detect Orphan Nodes (isolated nodes in multi-node workflows)
  const orphanNodes = nodes
    .filter(
      (n) =>
        (dependencyMap[n.id]?.length ?? 0) === 0 &&
        (dependentMap[n.id]?.length ?? 0) === 0,
    )
    .map((n) => n.id);

  return {
    isValid: errors.length === 0 && !hasCycles,
    hasCycles,
    cycleNodes: cycleNodes.length > 0 ? cycleNodes : undefined,
    topologicalOrder,
    dependencyMap,
    dependentMap,
    missingNodes: Array.from(new Set(missingNodes)),
    orphanNodes,
    errors,
  };
}
