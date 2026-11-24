export type AssertionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_true'
  | 'is_false'
  | 'length_equals'
  | 'length_greater_than'
  | 'length_less_than';

export type AssertionValueType = 'string' | 'number' | 'boolean' | 'json' | 'any';

export interface TestAssertion {
  id: string;
  targetNodeId: string;
  targetProperty: string;
  operator: AssertionOperator;
  expectedValue: string;
  expectedType?: AssertionValueType;
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actualValue: unknown;
  message: string;
}

export interface MockNodeResponse {
  enabled: boolean;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TestScenario {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  triggerPayload: Record<string, unknown>;
  assertions: TestAssertion[];
  mockResponses?: Record<string, MockNodeResponse>;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  lastRunPassed?: boolean;
  lastRunIsMocked?: boolean;
  lastRunResults?: AssertionResult[];
}

export interface TestSuite {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  scenarioIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioRunSummary {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  durationMs: number;
  assertionsTotal: number;
  assertionsPassed: number;
  results: AssertionResult[];
  error?: string;
  isMocked?: boolean;
}

export interface TestSuiteRunResult {
  suiteId?: string;
  workflowId: string;
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  startedAt: number;
  completedAt: number;
  scenarioResults: ScenarioRunSummary[];
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
