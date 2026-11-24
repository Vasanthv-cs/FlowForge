import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import type { TestScenario } from '@/types/testLab';
import { validateNodeConfig } from '@flowforge/workflow-core';
import { analyzeWorkflowGraph } from '@flowforge/workflow-core';

export interface WorkflowValidationIssue {
  id: string;
  type: 'error' | 'warning';
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: string;
  message: string;
  fixSuggestion: string;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

/**
 * Validates a workflow and its test scenario before test execution.
 * Checks graph connectivity, node settings, JSON integrity, and assertion references.
 */
export function validateWorkflowForTesting(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  scenario?: TestScenario,
): WorkflowValidationResult {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];

  // 1. Check for empty workflow
  if (nodes.length === 0) {
    errors.push({
      id: 'val-no-nodes',
      type: 'error',
      message: 'Workflow has no nodes on the canvas.',
      fixSuggestion: 'Drag and drop nodes from the left sidebar onto the canvas to construct your workflow.',
    });
    return { isValid: false, errors, warnings };
  }

  // 2. Check for trigger nodes
  const triggerNodes = nodes.filter((n) => n.data.category === 'trigger' && n.data.type !== 'webhook-response');
  if (triggerNodes.length === 0) {
    errors.push({
      id: 'val-no-triggers',
      type: 'error',
      message: 'Workflow does not contain an entry trigger node.',
      fixSuggestion: 'Add a "Manual Trigger", "Webhook Trigger", or "Schedule Trigger" node to initiate execution.',
    });
  }

  // 3. Graph Analysis: missing node references, cycles
  const graphAnalysis = analyzeWorkflowGraph(nodes, edges);
  if (!graphAnalysis.isValid) {
    graphAnalysis.errors.forEach((err, idx) => {
      errors.push({
        id: `val-graph-${idx}`,
        type: 'error',
        message: err,
        fixSuggestion: 'Review workflow connections. Remove cyclic loops and ensure all connections link to existing nodes.',
      });
    });
  }

  // 4. Connectivity check: Disconnected nodes
  const nodeMap = new Map<string, WorkflowNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const connectedNodeIds = new Set<string>();
  edges.forEach((e) => {
    connectedNodeIds.add(e.source);
    connectedNodeIds.add(e.target);
  });

  for (const node of nodes) {
    const isTrigger = node.data.category === 'trigger';
    if (!connectedNodeIds.has(node.id) && !isTrigger && nodes.length > 1) {
      warnings.push({
        id: `val-disconnected-${node.id}`,
        type: 'warning',
        nodeId: node.id,
        nodeLabel: node.data.label || node.data.type,
        nodeType: node.data.type,
        message: `Node "${node.data.label || node.data.type}" is disconnected.`,
        fixSuggestion: 'Connect an incoming edge to this node so it can receive data and execute.',
      });
    }
  }

  // 5. Node Configuration Validation (Zod schemas)
  for (const node of nodes) {
    const nodeErrors = validateNodeConfig(node);
    for (const err of nodeErrors) {
      errors.push({
        id: `val-node-${err.id}`,
        type: 'error',
        nodeId: node.id,
        nodeLabel: node.data.label || node.data.type,
        nodeType: node.data.type,
        message: `Node "${node.data.label || node.data.type}": ${err.message}`,
        fixSuggestion: `Open node inspector and correct the configuration field.`,
      });
    }

    // Specific JSON checks for node configs
    if (node.data.type === 'http-request') {
      const cfg = node.data.config as Record<string, unknown>;
      const url = String(cfg?.url || '').trim();
      if (!url) {
        errors.push({
          id: `val-http-empty-url-${node.id}`,
          type: 'error',
          nodeId: node.id,
          nodeLabel: node.data.label,
          nodeType: node.data.type,
          message: `HTTP Request endpoint URL is empty.`,
          fixSuggestion: 'Enter a valid HTTP or HTTPS endpoint URL in the HTTP Request configuration panel.',
        });
      }
    }
  }

  // 6. Test Scenario Validation
  if (scenario) {
    // Check scenario assertions
    if (!scenario.assertions || scenario.assertions.length === 0) {
      warnings.push({
        id: 'val-no-assertions',
        type: 'warning',
        message: `Scenario "${scenario.name}" has no assertions configured.`,
        fixSuggestion: 'Click "+ Add Assertion" to verify expected node outputs after execution.',
      });
    } else {
      scenario.assertions.forEach((as, idx) => {
        const targetNode = nodeMap.get(as.targetNodeId);
        if (!targetNode) {
          errors.push({
            id: `val-assertion-missing-node-${as.id || idx}`,
            type: 'error',
            message: `Assertion #${idx + 1} references non-existent node "${as.targetNodeId}".`,
            fixSuggestion: 'Select a valid target node from the dropdown in the assertion builder.',
          });
        }

        if (!as.targetProperty || as.targetProperty.trim() === '') {
          errors.push({
            id: `val-assertion-empty-property-${as.id || idx}`,
            type: 'error',
            message: `Assertion #${idx + 1} has an empty target property path.`,
            fixSuggestion: 'Enter property path (e.g. "status", "_condition.branch", or "data.items").',
          });
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
