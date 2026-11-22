export type AssertionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'exists';

export interface TestAssertion {
  id: string;
  targetNodeId: string;
  targetProperty: string;
  operator: AssertionOperator;
  expectedValue: string;
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actualValue: unknown;
  message: string;
}

export interface TestScenario {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  triggerPayload: Record<string, unknown>;
  assertions: TestAssertion[];
  lastRunAt?: number;
  lastRunPassed?: boolean;
  lastRunResults?: AssertionResult[];
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionTag: string;
  description: string;
  nodesCount: number;
  edgesCount: number;
  nodes: unknown[];
  edges: unknown[];
  savedAt: number;
}
