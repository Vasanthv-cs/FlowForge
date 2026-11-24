import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  PlayCircle,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FlaskConical,
  Check,
  Globe,
  ShieldCheck,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowEngine } from '@/engine/WorkflowEngine';
import { idbStorage } from '@/lib/indexedDb';
import type {
  TestScenario,
  TestAssertion,
  AssertionResult,
  AssertionOperator,
  AssertionValueType,
  MockNodeResponse,
  TestSuiteRunResult,
} from '@/types/testLab';
import type { WorkflowNode } from '@/types/workflow';
import {
  resolveProperty,
  evaluateAssertion,
  reconcileScenarioAssertions,
} from '@/utils/testAssertionEvaluator';
import {
  validateWorkflowForTesting,
  type WorkflowValidationResult,
} from '@/utils/workflowValidator';

interface TestLabModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const operatorOptions: { value: AssertionOperator; label: string; unary?: boolean }[] = [
  { value: 'equals', label: '== Equals' },
  { value: 'not_equals', label: '!= Not Equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
  { value: 'exists', label: 'Exists (Not Null/Undefined)', unary: true },
  { value: 'not_exists', label: 'Does Not Exist (Null/Undefined)', unary: true },
  { value: 'is_true', label: 'Is True (Boolean)', unary: true },
  { value: 'is_false', label: 'Is False (Boolean)', unary: true },
  { value: 'greater_than', label: '> Greater Than (Numeric)' },
  { value: 'less_than', label: '< Less Than (Numeric)' },
  { value: 'greater_than_or_equal', label: '>= Greater or Equal' },
  { value: 'less_than_or_equal', label: '<= Less or Equal' },
  { value: 'length_equals', label: 'Length Equals' },
  { value: 'length_greater_than', label: 'Length Greater Than' },
  { value: 'length_less_than', label: 'Length Less Than' },
];

const valueTypeOptions: { value: AssertionValueType; label: string }[] = [
  { value: 'any', label: 'Auto (Any)' },
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON' },
];

export function TestLabModal({ isOpen, onClose }: TestLabModalProps) {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scenario' | 'suiteSummary'>('scenario');
  const [suiteRunResult, setSuiteRunResult] = useState<TestSuiteRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runningScenarioIndex, setRunningScenarioIndex] = useState<number | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isJsonValid, setIsJsonValid] = useState(true);

  // Load scenarios from IndexedDB or seed defaults
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      const loaded = await idbStorage.listTestScenarios(workflowId);
      if (loaded.length > 0) {
        const { reconciled, hasChanges } = reconcileScenarioAssertions(loaded, nodes);
        setScenarios(reconciled);
        setSelectedScenarioId((prev) => (prev && reconciled.some((s) => s.id === prev) ? prev : reconciled[0].id));
        if (hasChanges) {
          for (const s of reconciled) {
            await idbStorage.saveTestScenario(s);
          }
        }
      } else {
        const conditionNode = nodes.find((n) => n.data.type === 'condition');
        const fallbackNodeId = conditionNode?.id ?? (nodes[0]?.id || 'node-1');

        // Seed 3 practical test scenarios for this workflow
        const seeded: TestScenario[] = [
          {
            id: `sc-seed-1-${Date.now()}`,
            workflowId,
            name: 'Standard Active User Scenario',
            description: 'Validates that an active user passes condition and flows to true branch',
            triggerPayload: {
              userId: 'usr_101',
              status: 'active',
              score: 95,
            },
            assertions: [
              {
                id: 'as-1',
                targetNodeId: fallbackNodeId,
                targetProperty: conditionNode ? '_condition.branch' : 'status',
                operator: 'equals',
                expectedValue: conditionNode ? 'true' : 'active',
                expectedType: 'string',
              },
            ],
          },
          {
            id: `sc-seed-2-${Date.now()}`,
            workflowId,
            name: 'Suspended / Inactive User Handling',
            description: 'Ensures suspended users evaluate to false branch and route correctly',
            triggerPayload: {
              userId: 'usr_202',
              status: 'suspended',
              score: 15,
            },
            assertions: [
              {
                id: 'as-2',
                targetNodeId: fallbackNodeId,
                targetProperty: conditionNode ? '_condition.branch' : 'status',
                operator: 'equals',
                expectedValue: conditionNode ? 'false' : 'suspended',
                expectedType: 'string',
              },
            ],
          },
          {
            id: `sc-seed-3-${Date.now()}`,
            workflowId,
            name: 'High-Value Enterprise Customer',
            description: 'Tests high-tier enterprise payload routing with complete status check',
            triggerPayload: {
              userId: 'usr_999',
              status: 'active',
              tier: 'enterprise',
            },
            assertions: [
              {
                id: 'as-3',
                targetNodeId: fallbackNodeId,
                targetProperty: conditionNode ? '_condition.branch' : 'status',
                operator: 'equals',
                expectedValue: conditionNode ? 'true' : 'active',
                expectedType: 'string',
              },
            ],
          },
        ];

        setScenarios(seeded);
        setSelectedScenarioId(seeded[0].id);
        for (const s of seeded) {
          await idbStorage.saveTestScenario(s);
        }
      }
    })();
  }, [isOpen, workflowId, nodes]);

  const currentScenario =
    scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0];

  const handleSaveScenario = async (updated: TestScenario) => {
    const list = scenarios.map((s) => (s.id === updated.id ? updated : s));
    setScenarios(list);
    await idbStorage.saveTestScenario(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1500);
  };

  const handleCreateScenario = async () => {
    const conditionNode = nodes.find((n) => n.data.type === 'condition');
    const newSc: TestScenario = {
      id: `sc-${Date.now()}`,
      workflowId,
      name: `Scenario #${scenarios.length + 1}`,
      description: 'Enter test case description...',
      triggerPayload: conditionNode
        ? { orderAmount: 250, customer: 'Alice', status: 'active' }
        : { userId: 'usr_test', status: 'active' },
      assertions: [
        {
          id: `as-${Date.now()}`,
          targetNodeId: conditionNode?.id ?? (nodes[0]?.id || ''),
          targetProperty: conditionNode ? '_condition.branch' : 'status',
          operator: 'equals',
          expectedValue: conditionNode ? 'true' : 'active',
          expectedType: 'string',
        },
      ],
    };
    const list = [...scenarios, newSc];
    setScenarios(list);
    setSelectedScenarioId(newSc.id);
    setActiveTab('scenario');
    await idbStorage.saveTestScenario(newSc);
  };

  const handleDuplicateScenario = async (id: string) => {
    const duplicated = await idbStorage.duplicateTestScenario(workflowId, id);
    if (duplicated) {
      const list = [...scenarios, duplicated];
      setScenarios(list);
      setSelectedScenarioId(duplicated.id);
      setActiveTab('scenario');
    }
  };

  const handleDeleteScenario = async (id: string) => {
    const list = scenarios.filter((s) => s.id !== id);
    setScenarios(list);
    if (selectedScenarioId === id) {
      setSelectedScenarioId(list[0]?.id || null);
    }
    await idbStorage.deleteTestScenario(workflowId, id);
  };

  // Run a single scenario
  const executeSingleScenario = async (scenario: TestScenario): Promise<TestScenario> => {
    const start = Date.now();
    const engine = new WorkflowEngine();

    // Map scenario mock responses if enabled
    const mockResponses: Record<string, { enabled: boolean; statusCode?: number; headers?: Record<string, string>; body?: unknown }> = {};
    let usedMock = false;

    if (scenario.mockResponses) {
      for (const [nodeId, mock] of Object.entries(scenario.mockResponses)) {
        if (mock && mock.enabled) {
          mockResponses[nodeId] = mock;
          usedMock = true;
        }
      }
    }

    const result = await engine.executeWorkflow(workflowId, nodes, edges, {
      overrideTriggerPayload: scenario.triggerPayload,
      testMode: true,
      mockResponses,
    });

    // Evaluate assertions against actual result
    const assertionResults: AssertionResult[] = scenario.assertions.map((assertion) => {
      const targetNode = nodes.find((n) => n.id === assertion.targetNodeId);
      const nodeRecord = result.nodeRecords[assertion.targetNodeId];
      if (!nodeRecord) {
        const nodeLabel = targetNode?.data?.label || assertion.targetNodeId;
        return {
          assertion,
          passed: false,
          actualValue: undefined,
          message: `Target node "${nodeLabel}" did not execute or was not found in workflow run.`,
        };
      }

      const actual = resolveProperty(nodeRecord.outputData, assertion.targetProperty);
      return evaluateAssertion(actual, assertion);
    });

    const allPassed =
      assertionResults.length > 0 && assertionResults.every((r) => r.passed);
    const durationMs = Date.now() - start;

    return {
      ...scenario,
      lastRunAt: Date.now(),
      lastRunDurationMs: durationMs,
      lastRunPassed: allPassed,
      lastRunIsMocked: usedMock,
      lastRunResults: assertionResults,
    };
  };

  const handleRunScenario = async () => {
    if (!currentScenario) return;
    setIsRunning(true);
    try {
      const updated = await executeSingleScenario(currentScenario);
      await handleSaveScenario(updated);
    } finally {
      setIsRunning(false);
    }
  };

  // Run all scenarios in test suite
  const handleRunSuite = async () => {
    if (scenarios.length === 0) return;
    setIsRunning(true);
    const suiteStart = Date.now();
    const updatedList: TestScenario[] = [];

    try {
      for (let i = 0; i < scenarios.length; i++) {
        setRunningScenarioIndex(i);
        const sc = scenarios[i];
        const updated = await executeSingleScenario(sc);
        updatedList.push(updated);
        await idbStorage.saveTestScenario(updated);
      }

      setScenarios(updatedList);

      const totalDuration = Date.now() - suiteStart;
      const passedCount = updatedList.filter((s) => s.lastRunPassed).length;
      const failedCount = updatedList.length - passedCount;

      const summary: TestSuiteRunResult = {
        workflowId,
        totalScenarios: updatedList.length,
        passedCount,
        failedCount,
        durationMs: totalDuration,
        startedAt: suiteStart,
        completedAt: Date.now(),
        scenarioResults: updatedList.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          passed: !!s.lastRunPassed,
          durationMs: s.lastRunDurationMs ?? 0,
          assertionsTotal: s.assertions.length,
          assertionsPassed: (s.lastRunResults || []).filter((r) => r.passed).length,
          results: s.lastRunResults || [],
          isMocked: s.lastRunIsMocked,
        })),
      };

      setSuiteRunResult(summary);
      setActiveTab('suiteSummary');
    } finally {
      setIsRunning(false);
      setRunningScenarioIndex(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
      <div className="relative flex flex-col w-full max-w-5xl h-[88vh] rounded-xl border border-[#2a2a3e] bg-[#13131d] shadow-2xl overflow-hidden">
        {/* Studio Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e2e] bg-[#101018] px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 border border-violet-500/40 text-violet-400">
              <FlaskConical className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                Workflow Testing Laboratory
              </h2>
              <p className="text-[11px] text-gray-400">
                Automated regression & scenario testing for: <span className="text-gray-200 font-medium">{workflowName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 mr-1 animate-fade-in">
                <Check className="h-3 w-3" /> Auto-saved
              </span>
            )}

            {/* Run Suite Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunSuite}
              disabled={isRunning || scenarios.length === 0}
              className="flex items-center gap-1.5 border-violet-500/40 text-violet-300 hover:bg-violet-950/30"
              title="Run all scenarios in the test suite"
            >
              <PlayCircle className="h-3.5 w-3.5 text-violet-400 fill-current" />
              {isRunning && runningScenarioIndex !== null
                ? `Running Suite (${runningScenarioIndex + 1}/${scenarios.length})...`
                : 'Run Entire Suite'}
            </Button>

            {/* Run Single Scenario Button */}
            <Button
              variant="success"
              size="sm"
              onClick={handleRunScenario}
              disabled={isRunning || !currentScenario || !isJsonValid}
              className="flex items-center gap-1.5"
            >
              <Play className="h-3 w-3 fill-current" />
              {isRunning && runningScenarioIndex === null ? 'Running Scenario...' : 'Run Scenario'}
            </Button>

            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-gray-400 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-[#1e1e2e] bg-[#12121a] px-4 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('scenario')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeTab === 'scenario'
                ? 'bg-[#1e1e2e] text-white border border-[#2e2e42]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Scenario Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('suiteSummary')}
            className={`px-3 py-1 rounded font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'suiteSummary'
                ? 'bg-[#1e1e2e] text-white border border-[#2e2e42]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers className="h-3 w-3" />
            Suite Summary
            {suiteRunResult && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  suiteRunResult.failedCount === 0
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {suiteRunResult.passedCount}/{suiteRunResult.totalScenarios}
              </span>
            )}
          </button>
        </div>

        {/* Studio Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Scenarios Sidebar */}
          <div className="w-64 border-r border-[#1e1e2e] bg-[#101018] flex flex-col shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Scenarios ({scenarios.length})
              </span>
              <button
                type="button"
                onClick={handleCreateScenario}
                className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors font-medium"
              >
                <Plus className="h-3 w-3" /> New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {scenarios.map((sc, index) => (
                <div
                  key={sc.id}
                  onClick={() => {
                    setSelectedScenarioId(sc.id);
                    setActiveTab('scenario');
                  }}
                  className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                    sc.id === selectedScenarioId && activeTab === 'scenario'
                      ? 'bg-violet-600/20 border border-violet-500/50 text-white shadow-sm'
                      : 'hover:bg-[#1a1a2e] text-gray-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{sc.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                      {isRunning && runningScenarioIndex === index ? (
                        <span className="text-violet-400 font-bold flex items-center gap-1 animate-pulse">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" /> RUNNING...
                        </span>
                      ) : sc.lastRunPassed === undefined ? (
                        <span className="text-gray-500">Not Run</span>
                      ) : sc.lastRunPassed ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> PASSED
                          {sc.lastRunDurationMs !== undefined && (
                            <span className="text-gray-500 font-normal">({sc.lastRunDurationMs}ms)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-red-400 font-semibold flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" /> FAILED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Duplicate Scenario */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateScenario(sc.id);
                      }}
                      title="Duplicate scenario"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded text-gray-500 hover:text-violet-300 hover:bg-violet-500/10 transition-opacity"
                    >
                      <Copy className="h-3 w-3" />
                    </button>

                    {/* Delete Scenario */}
                    {scenarios.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteScenario(sc.id);
                        }}
                        title="Delete scenario"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'suiteSummary' ? (
              <SuiteSummaryView
                summary={suiteRunResult}
                onSelectScenario={(scId) => {
                  setSelectedScenarioId(scId);
                  setActiveTab('scenario');
                }}
                onRunSuite={handleRunSuite}
                isRunning={isRunning}
              />
            ) : currentScenario ? (
              <ScenarioDetailView
                key={currentScenario.id}
                scenario={currentScenario}
                nodes={nodes}
                edges={edges}
                onSave={handleSaveScenario}
                onJsonValidChange={setIsJsonValid}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                Select or create a scenario to begin testing.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── SCENARIO DETAIL & ASSERTIONS COMPONENT ── */

interface ScenarioDetailViewProps {
  scenario: TestScenario;
  nodes: WorkflowNode[];
  edges: unknown[];
  onSave: (updated: TestScenario) => void;
  onJsonValidChange: (valid: boolean) => void;
}

function ScenarioDetailView({
  scenario,
  nodes,
  edges,
  onSave,
  onJsonValidChange,
}: ScenarioDetailViewProps) {
  const [payloadDraft, setPayloadDraft] = useState(() =>
    JSON.stringify(scenario.triggerPayload ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showMocks, setShowMocks] = useState(false);
  const [showValidationIssues, setShowValidationIssues] = useState(false);

  // Pre-test workflow validation
  const validation: WorkflowValidationResult = useMemo(
    () => validateWorkflowForTesting(nodes, edges as never, scenario),
    [nodes, edges, scenario],
  );

  const httpNodes = useMemo(
    () => nodes.filter((n) => n.data.type === 'http-request'),
    [nodes],
  );

  const handleJsonChange = (val: string) => {
    setPayloadDraft(val);
    try {
      const parsed = JSON.parse(val);
      setJsonError(null);
      onJsonValidChange(true);
      onSave({ ...scenario, triggerPayload: parsed });
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
      onJsonValidChange(false);
    }
  };

  const handleUpdateMock = (nodeId: string, patch: Partial<MockNodeResponse>) => {
    const existing = scenario.mockResponses?.[nodeId] || { enabled: false, statusCode: 200 };
    const nextMock: MockNodeResponse = { ...existing, ...patch };
    const nextResponses = {
      ...(scenario.mockResponses || {}),
      [nodeId]: nextMock,
    };
    onSave({ ...scenario, mockResponses: nextResponses });
  };

  return (
    <div className="p-5 space-y-5">
      {/* Pre-Test Validation Alert (if issues exist) */}
      {!validation.isValid && (
        <div className="rounded-lg p-3 border border-red-500/40 bg-red-950/20 text-red-300 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>Workflow Validation Detected {validation.errors.length} Issue(s)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowValidationIssues(!showValidationIssues)}
              className="text-[11px] underline text-red-300 hover:text-white"
            >
              {showValidationIssues ? 'Hide Details' : 'View Actionable Fixes'}
            </button>
          </div>

          {showValidationIssues && (
            <ul className="space-y-1.5 pt-1 pl-6 list-disc border-t border-red-500/20">
              {validation.errors.map((e) => (
                <li key={e.id} className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-white">{e.message}</span>
                  <p className="text-red-400 text-[10px]">Fix: {e.fixSuggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Scenario Name & Description */}
      <div className="space-y-2">
        <input
          type="text"
          value={scenario.name}
          onChange={(e) => onSave({ ...scenario, name: e.target.value })}
          className="w-full text-base font-bold text-gray-100 bg-[#1a1a2e] px-3 py-1.5 rounded border border-[#2a2a3e] focus:border-violet-500 focus:outline-none"
          placeholder="Scenario Name"
        />
        <input
          type="text"
          value={scenario.description}
          onChange={(e) => onSave({ ...scenario, description: e.target.value })}
          className="w-full text-xs text-gray-400 bg-[#161622] px-3 py-1 rounded border border-[#232336] focus:border-violet-500 focus:outline-none"
          placeholder="Describe what this test scenario verifies..."
        />
      </div>

      {/* Status & Service Execution Banner */}
      {scenario.lastRunPassed !== undefined && (
        <div
          className={`rounded-lg p-3 border flex items-center justify-between text-xs font-mono ${
            scenario.lastRunPassed
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/30 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {scenario.lastRunPassed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            )}
            <span className="font-bold">
              {scenario.lastRunPassed
                ? 'ALL TEST ASSERTIONS PASSED'
                : 'TEST SCENARIO FAILED EXPECTATIONS'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[10px]">
            {scenario.lastRunIsMocked ? (
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1 font-sans">
                <ShieldCheck className="h-3 w-3" /> Mocked External Calls
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-gray-700/40 text-gray-400 border border-gray-600/30 flex items-center gap-1 font-sans">
                <Globe className="h-3 w-3" /> Live Requests
              </span>
            )}

            {scenario.lastRunDurationMs !== undefined && (
              <span className="flex items-center gap-1 text-gray-400">
                <Clock className="h-3 w-3" /> {scenario.lastRunDurationMs}ms
              </span>
            )}

            {scenario.lastRunAt && (
              <span className="text-gray-500">
                {new Date(scenario.lastRunAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trigger Input JSON */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-300 block">
            Sample Trigger Input (JSON):
          </label>
          {jsonError && (
            <span className="text-[10px] text-red-400 font-mono">
              {jsonError}
            </span>
          )}
        </div>
        <textarea
          rows={5}
          value={payloadDraft}
          onChange={(e) => handleJsonChange(e.target.value)}
          className={`w-full font-mono text-xs text-gray-200 bg-[#161622] p-2.5 rounded-lg border focus:outline-none transition-colors ${
            jsonError
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-[#2a2a3e] focus:border-violet-500'
          }`}
          placeholder='{\n  "userId": "123",\n  "status": "active"\n}'
        />
      </div>

      {/* Deterministic Mocking Configuration Section */}
      {httpNodes.length > 0 && (
        <div className="rounded-lg border border-[#2a2a3e] bg-[#161622] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMocks(!showMocks)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1a1a2e] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400" />
              <span>Deterministic Test Mode: HTTP Mocking ({httpNodes.length} node{httpNodes.length > 1 ? 's' : ''})</span>
            </div>
            {showMocks ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>

          {showMocks && (
            <div className="p-3.5 border-t border-[#2a2a3e] space-y-3 bg-[#111118]">
              <p className="text-[11px] text-gray-400">
                Stub external HTTP requests to ensure reliable, zero-side-effect test execution without hitting live third-party APIs.
              </p>

              {httpNodes.map((hNode) => {
                const mock = scenario.mockResponses?.[hNode.id] || { enabled: false, statusCode: 200, body: '{}' };
                return (
                  <div key={hNode.id} className="p-2.5 rounded border border-[#2a2a3e] bg-[#161622] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`mock-${hNode.id}`}
                          checked={mock.enabled}
                          onChange={(e) => handleUpdateMock(hNode.id, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-gray-600 bg-[#1e1e2e] text-indigo-500"
                        />
                        <label htmlFor={`mock-${hNode.id}`} className="text-xs font-semibold text-gray-200">
                          Mock "{hNode.data.label}" ({hNode.id})
                        </label>
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${mock.enabled ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30' : 'text-gray-500'}`}>
                        {mock.enabled ? 'MOCK ACTIVE' : 'CALLS LIVE ENDPOINT'}
                      </span>
                    </div>

                    {mock.enabled && (
                      <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-0.5">Status Code</label>
                          <input
                            type="number"
                            value={mock.statusCode ?? 200}
                            onChange={(e) => handleUpdateMock(hNode.id, { statusCode: parseInt(e.target.value, 10) || 200 })}
                            className="w-full h-7 rounded border border-[#2a2a3e] bg-[#12121a] px-2 text-xs text-gray-200"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-400 block mb-0.5">Mocked Response Body (JSON or Text)</label>
                          <input
                            type="text"
                            value={typeof mock.body === 'string' ? mock.body : JSON.stringify(mock.body || {})}
                            onChange={(e) => handleUpdateMock(hNode.id, { body: e.target.value })}
                            placeholder='{"success": true, "data": []}'
                            className="w-full h-7 rounded border border-[#2a2a3e] bg-[#12121a] px-2 text-xs font-mono text-gray-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expected Output Assertions Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-300">
            Expected Output Assertions ({scenario.assertions.length})
          </label>
          <button
            type="button"
            onClick={() => {
              const conditionNode = nodes.find((n) => n.data.type === 'condition');
              const newAs: TestAssertion = {
                id: `as-${Date.now()}`,
                targetNodeId: conditionNode?.id ?? (nodes[0]?.id || ''),
                targetProperty: conditionNode ? '_condition.branch' : 'status',
                operator: 'equals',
                expectedValue: conditionNode ? 'true' : 'active',
                expectedType: 'any',
              };
              onSave({
                ...scenario,
                assertions: [...scenario.assertions, newAs],
              });
            }}
            disabled={nodes.length === 0}
            className="text-[11px] text-violet-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
          >
            <Plus className="h-3 w-3" /> Add Assertion
          </button>
        </div>

        {nodes.length === 0 && (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>No nodes in this workflow. Add nodes on the canvas to configure assertions.</span>
          </div>
        )}

        <div className="space-y-2.5">
          {scenario.assertions.map((as, idx) => {
            const result = scenario.lastRunResults?.[idx];
            const targetNode = nodes.find((n) => n.id === as.targetNodeId);
            const selectedNodeExists = !!targetNode;
            const currentOp = operatorOptions.find((o) => o.value === as.operator);
            const isUnary = !!currentOp?.unary;

            return (
              <div
                key={as.id}
                className={`p-3 rounded-lg border space-y-2 text-xs transition-colors ${
                  result
                    ? result.passed
                      ? 'bg-emerald-950/10 border-emerald-500/30'
                      : 'bg-red-950/10 border-red-500/30'
                    : 'bg-[#161622] border-[#2a2a3e]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Target Node Selector - Fixed & Robust */}
                  <select
                    value={selectedNodeExists ? as.targetNodeId : ''}
                    onChange={(e) => {
                      const updated = scenario.assertions.map((item) =>
                        item.id === as.id ? { ...item, targetNodeId: e.target.value } : item,
                      );
                      onSave({ ...scenario, assertions: updated });
                    }}
                    className={`w-1/3 h-7 rounded border px-2 text-[11px] focus:outline-none ${
                      selectedNodeExists
                        ? 'border-[#2a2a3e] bg-[#1a1a2e] text-gray-200 focus:border-violet-500'
                        : 'border-red-500/50 bg-red-950/20 text-red-300'
                    }`}
                  >
                    {!selectedNodeExists && (
                      <option value="">
                        ⚠️ Select Node ({as.targetNodeId || 'Unlinked'})
                      </option>
                    )}
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.data.label || n.data.type} ({n.data.type})
                      </option>
                    ))}
                  </select>

                  {/* Property Path */}
                  <input
                    type="text"
                    value={as.targetProperty}
                    onChange={(e) => {
                      const updated = scenario.assertions.map((item) =>
                        item.id === as.id ? { ...item, targetProperty: e.target.value } : item,
                      );
                      onSave({ ...scenario, assertions: updated });
                    }}
                    placeholder="property.path (e.g. status)"
                    className="w-1/4 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] font-mono text-gray-200 focus:border-violet-500 focus:outline-none"
                  />

                  {/* Operator */}
                  <select
                    value={as.operator}
                    onChange={(e) => {
                      const updated = scenario.assertions.map((item) =>
                        item.id === as.id
                          ? { ...item, operator: e.target.value as AssertionOperator }
                          : item,
                      );
                      onSave({ ...scenario, assertions: updated });
                    }}
                    className="w-1/4 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] text-gray-200 focus:border-violet-500 focus:outline-none"
                  >
                    {operatorOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {/* Type Selector (when not unary) */}
                  {!isUnary && (
                    <select
                      value={as.expectedType || 'any'}
                      onChange={(e) => {
                        const updated = scenario.assertions.map((item) =>
                          item.id === as.id
                            ? { ...item, expectedType: e.target.value as AssertionValueType }
                            : item,
                        );
                        onSave({ ...scenario, assertions: updated });
                      }}
                      className="w-20 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-1.5 text-[10px] text-gray-300 focus:border-violet-500 focus:outline-none"
                    >
                      {valueTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Expected Value (when not unary) */}
                  {!isUnary ? (
                    <input
                      type="text"
                      value={as.expectedValue}
                      onChange={(e) => {
                        const updated = scenario.assertions.map((item) =>
                          item.id === as.id ? { ...item, expectedValue: e.target.value } : item,
                        );
                        onSave({ ...scenario, assertions: updated });
                      }}
                      placeholder="Expected Value"
                      className="flex-1 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] font-mono text-gray-200 focus:border-violet-500 focus:outline-none"
                    />
                  ) : (
                    <div className="flex-1 h-7 flex items-center px-2 text-[11px] text-gray-500 italic">
                      (No expected value required)
                    </div>
                  )}

                  {/* Delete assertion */}
                  <button
                    type="button"
                    onClick={() => {
                      const updated = scenario.assertions.filter((item) => item.id !== as.id);
                      onSave({ ...scenario, assertions: updated });
                    }}
                    title="Remove assertion"
                    className="h-7 w-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Warning if node not found */}
                {!selectedNodeExists && (
                  <div className="text-[10px] text-red-400 flex items-center gap-1 font-mono">
                    <AlertTriangle className="h-3 w-3" />
                    Target node ID "{as.targetNodeId || 'none'}" was deleted or missing. Please select an active node.
                  </div>
                )}

                {/* Assertion Result Feedback */}
                {result && (
                  <div className="pt-1 text-[11px] font-mono flex items-center justify-between border-t border-[#2a2a3e]/50">
                    <span className={result.passed ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                      {result.message}
                    </span>
                    <span className="text-gray-500 text-[10px]">
                      Actual: {JSON.stringify(result.actualValue)} ({typeof result.actualValue})
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── SUITE SUMMARY VIEW COMPONENT ── */

interface SuiteSummaryViewProps {
  summary: TestSuiteRunResult | null;
  onSelectScenario: (scenarioId: string) => void;
  onRunSuite: () => void;
  isRunning: boolean;
}

function SuiteSummaryView({
  summary,
  onSelectScenario,
  onRunSuite,
  isRunning,
}: SuiteSummaryViewProps) {
  if (!summary) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center mx-auto">
          <Layers className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">No Test Suite Results Yet</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          Execute the entire test suite to view aggregate regression metrics, duration breakdown, and failure analysis.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRunSuite}
          disabled={isRunning}
          className="border-violet-500/40 text-violet-300"
        >
          <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
          {isRunning ? 'Running Suite...' : 'Run Test Suite Now'}
        </Button>
      </div>
    );
  }

  const allPassed = summary.failedCount === 0;

  return (
    <div className="p-5 space-y-5">
      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg p-3 bg-[#161622] border border-[#2a2a3e]">
          <span className="text-[10px] text-gray-400 font-semibold uppercase">Total Scenarios</span>
          <p className="text-xl font-bold text-gray-100 mt-1">{summary.totalScenarios}</p>
        </div>
        <div className="rounded-lg p-3 bg-emerald-950/20 border border-emerald-500/30">
          <span className="text-[10px] text-emerald-400 font-semibold uppercase">Passed</span>
          <p className="text-xl font-bold text-emerald-300 mt-1">{summary.passedCount}</p>
        </div>
        <div className="rounded-lg p-3 bg-red-950/20 border border-red-500/30">
          <span className="text-[10px] text-red-400 font-semibold uppercase">Failed</span>
          <p className="text-xl font-bold text-red-300 mt-1">{summary.failedCount}</p>
        </div>
        <div className="rounded-lg p-3 bg-[#161622] border border-[#2a2a3e]">
          <span className="text-[10px] text-gray-400 font-semibold uppercase">Execution Time</span>
          <p className="text-xl font-bold text-violet-300 mt-1 font-mono">{summary.durationMs}ms</p>
        </div>
      </div>

      {/* Aggregate Status Banner */}
      <div
        className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono ${
          allPassed
            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
            : 'bg-red-950/30 border-red-500/40 text-red-300'
        }`}
      >
        <div className="flex items-center gap-2">
          {allPassed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-400" />
          )}
          <span className="font-bold">
            {allPassed ? 'SUITE PASSED — ALL SCENARIOS VERIFIED' : `${summary.failedCount} SCENARIO(S) FAILED REGRESSION EXPECTATIONS`}
          </span>
        </div>
        <span className="text-[10px] text-gray-400">
          Completed at: {new Date(summary.completedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Scenario Results Table */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-300">Scenario Breakdown</h4>
        <div className="rounded-lg border border-[#2a2a3e] bg-[#161622] divide-y divide-[#2a2a3e] overflow-hidden text-xs">
          {summary.scenarioResults.map((item) => (
            <div
              key={item.scenarioId}
              onClick={() => onSelectScenario(item.scenarioId)}
              className="p-3 flex items-center justify-between hover:bg-[#1c1c2e] cursor-pointer transition-colors"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-100">{item.scenarioName}</span>
                  {item.isMocked && (
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[9px] font-mono">
                      MOCKED
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 font-mono">
                  {item.assertionsPassed} of {item.assertionsTotal} assertions met
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {item.durationMs}ms
                </span>

                {item.passed ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold">
                    FAILED
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
