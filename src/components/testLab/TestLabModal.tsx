import { useState, useEffect } from 'react';
import {
  X,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowEngine } from '@/engine/WorkflowEngine';
import { idbStorage } from '@/lib/indexedDb';
import type { TestScenario, TestAssertion, AssertionResult } from '@/types/testLab';

interface TestLabModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TestLabModal({ isOpen, onClose }: TestLabModalProps) {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load scenarios from IndexedDB or seed defaults
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      const loaded = await idbStorage.listTestScenarios(workflowId);
      if (loaded.length > 0) {
        setScenarios(loaded);
        setSelectedScenarioId(loaded[0].id);
      } else {
        // Seed at least 3 default test scenarios for this workflow
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
                targetNodeId: nodes.find((n) => n.data.type === 'condition')?.id ?? (nodes[0]?.id || 'node-1'),
                targetProperty: '_condition.branch',
                operator: 'equals',
                expectedValue: 'true',
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
                targetNodeId: nodes.find((n) => n.data.type === 'condition')?.id ?? (nodes[0]?.id || 'node-1'),
                targetProperty: '_condition.branch',
                operator: 'equals',
                expectedValue: 'false',
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
                targetNodeId: nodes.find((n) => n.data.type === 'condition')?.id ?? (nodes[0]?.id || 'node-1'),
                targetProperty: '_condition.branch',
                operator: 'equals',
                expectedValue: 'true',
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

  if (!isOpen) return null;

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
    const newSc: TestScenario = {
      id: `sc-${Date.now()}`,
      workflowId,
      name: `New Scenario #${scenarios.length + 1}`,
      description: 'Enter scenario description...',
      triggerPayload: { userId: 'usr_test', status: 'active' },
      assertions: [
        {
          id: `as-${Date.now()}`,
          targetNodeId: nodes[0]?.id || '',
          targetProperty: 'status',
          operator: 'equals',
          expectedValue: 'active',
        },
      ],
    };
    const list = [...scenarios, newSc];
    setScenarios(list);
    setSelectedScenarioId(newSc.id);
    await idbStorage.saveTestScenario(newSc);
  };

  const handleDeleteScenario = async (id: string) => {
    const list = scenarios.filter((s) => s.id !== id);
    setScenarios(list);
    if (selectedScenarioId === id) {
      setSelectedScenarioId(list[0]?.id || null);
    }
    await idbStorage.deleteTestScenario(workflowId, id);
  };

  // Helper to resolve property path
  const resolveProp = (obj: unknown, path: string): unknown => {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object') {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return undefined;
      }
    }
    return cur;
  };

  // Run the single selected scenario
  const handleRunScenario = async () => {
    if (!currentScenario) return;
    setIsRunning(true);

    try {
      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow(workflowId, nodes, edges, {
        overrideTriggerPayload: currentScenario.triggerPayload,
      });

      // Evaluate assertions against result
      const assertionResults: AssertionResult[] = currentScenario.assertions.map(
        (assertion) => {
          const nodeRecord = result.nodeRecords[assertion.targetNodeId];
          if (!nodeRecord) {
            return {
              assertion,
              passed: false,
              actualValue: undefined,
              message: `Target node "${assertion.targetNodeId}" did not execute or was not found.`,
            };
          }

          const actual = resolveProp(nodeRecord.outputData, assertion.targetProperty);
          let passed = false;

          switch (assertion.operator) {
            case 'equals':
              passed = String(actual).trim() === String(assertion.expectedValue).trim();
              break;
            case 'not_equals':
              passed = String(actual).trim() !== String(assertion.expectedValue).trim();
              break;
            case 'contains':
              passed = String(actual).includes(String(assertion.expectedValue));
              break;
            case 'greater_than':
              passed = Number(actual) > Number(assertion.expectedValue);
              break;
            case 'less_than':
              passed = Number(actual) < Number(assertion.expectedValue);
              break;
            case 'exists':
              passed = actual !== undefined && actual !== null;
              break;
          }

          return {
            assertion,
            passed,
            actualValue: actual,
            message: passed
              ? `Passed: "${assertion.targetProperty}" == "${actual}"`
              : `Assertion Failed: Expected "${assertion.expectedValue}", but got "${actual}"`,
          };
        },
      );

      const allPassed =
        assertionResults.length > 0 && assertionResults.every((r) => r.passed);

      const updated: TestScenario = {
        ...currentScenario,
        lastRunAt: Date.now(),
        lastRunPassed: allPassed,
        lastRunResults: assertionResults,
      };

      await handleSaveScenario(updated);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
      <div className="relative flex flex-col w-full max-w-4xl h-[85vh] rounded-xl border border-[#2a2a3e] bg-[#13131d] shadow-2xl overflow-hidden">
        {/* Header */}
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
                Automated regression testing for: <span className="text-gray-200">{workflowName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 mr-1 animate-fade-in">
                <Check className="h-3 w-3" /> Auto-saved
              </span>
            )}
            <Button
              variant="success"
              size="sm"
              onClick={handleRunScenario}
              disabled={isRunning || !currentScenario}
              className="flex items-center gap-1.5"
            >
              <Play className="h-3 w-3 fill-current" />
              {isRunning ? 'Running Test...' : 'Run Scenario'}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Studio Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Scenarios List */}
          <div className="w-64 border-r border-[#1e1e2e] bg-[#101018] flex flex-col shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Scenarios ({scenarios.length})
              </span>
              <button
                type="button"
                onClick={handleCreateScenario}
                className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Plus className="h-3 w-3" /> New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {scenarios.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => setSelectedScenarioId(sc.id)}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                    sc.id === selectedScenarioId
                      ? 'bg-violet-600/20 border border-violet-500/50 text-white'
                      : 'hover:bg-[#1a1a2e] text-gray-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{sc.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                      {sc.lastRunPassed === undefined ? (
                        <span className="text-gray-500">Not Run</span>
                      ) : sc.lastRunPassed ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> PASSED
                        </span>
                      ) : (
                        <span className="text-red-400 font-semibold flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" /> FAILED
                        </span>
                      )}
                    </div>
                  </div>

                  {scenarios.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScenario(sc.id);
                      }}
                      className="h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Scenario Detail & Assertion Runner */}
          {currentScenario ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Scenario Name & Description */}
              <div className="space-y-2">
                <input
                  type="text"
                  value={currentScenario.name}
                  onChange={(e) =>
                    handleSaveScenario({ ...currentScenario, name: e.target.value })
                  }
                  className="w-full text-base font-bold text-gray-100 bg-[#1a1a2e] px-3 py-1.5 rounded border border-[#2a2a3e] focus:border-violet-500 focus:outline-none"
                  placeholder="Scenario Name"
                />
                <input
                  type="text"
                  value={currentScenario.description}
                  onChange={(e) =>
                    handleSaveScenario({ ...currentScenario, description: e.target.value })
                  }
                  className="w-full text-xs text-gray-400 bg-[#161622] px-3 py-1 rounded border border-[#232336] focus:border-violet-500 focus:outline-none"
                  placeholder="Describe the test case..."
                />
              </div>

              {/* Status Banner */}
              {currentScenario.lastRunPassed !== undefined && (
                <div
                  className={`rounded-lg p-3 border flex items-center justify-between text-xs font-mono ${
                    currentScenario.lastRunPassed
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-red-950/30 border-red-500/40 text-red-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {currentScenario.lastRunPassed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <span className="font-bold">
                      {currentScenario.lastRunPassed
                        ? 'ALL TEST ASSERTIONS PASSED'
                        : 'TEST SCENARIO FAILED EXPECTATIONS'}
                    </span>
                  </div>
                  {currentScenario.lastRunAt && (
                    <span className="text-[10px] text-gray-400">
                      Executed: {new Date(currentScenario.lastRunAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              )}

              {/* Trigger Input JSON */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block">
                  Sample Trigger Input (JSON):
                </label>
                <textarea
                  rows={5}
                  value={JSON.stringify(currentScenario.triggerPayload, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleSaveScenario({ ...currentScenario, triggerPayload: parsed });
                    } catch {
                      // ignore parse errors while user is actively editing JSON
                    }
                  }}
                  className="w-full font-mono text-xs text-gray-200 bg-[#161622] p-2.5 rounded-lg border border-[#2a2a3e] focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Assertions Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-300">
                    Expected Output Assertions ({currentScenario.assertions.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newAs: TestAssertion = {
                        id: `as-${Date.now()}`,
                        targetNodeId: nodes[0]?.id || '',
                        targetProperty: 'status',
                        operator: 'equals',
                        expectedValue: 'active',
                      };
                      handleSaveScenario({
                        ...currentScenario,
                        assertions: [...currentScenario.assertions, newAs],
                      });
                    }}
                    className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Assertion
                  </button>
                </div>

                <div className="space-y-2">
                  {currentScenario.assertions.map((as, idx) => {
                    const result = currentScenario.lastRunResults?.[idx];
                    return (
                      <div
                        key={as.id}
                        className={`p-3 rounded-lg border space-y-2 text-xs ${
                          result
                            ? result.passed
                              ? 'bg-emerald-950/10 border-emerald-500/30'
                              : 'bg-red-950/10 border-red-500/30'
                            : 'bg-[#161622] border-[#2a2a3e]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {/* Node Selector */}
                          <select
                            value={as.targetNodeId}
                            onChange={(e) => {
                              const updated = currentScenario.assertions.map((item) =>
                                item.id === as.id ? { ...item, targetNodeId: e.target.value } : item,
                              );
                              handleSaveScenario({ ...currentScenario, assertions: updated });
                            }}
                            className="w-1/3 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] text-gray-200 focus:border-violet-500 focus:outline-none"
                          >
                            {nodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.data.label}
                              </option>
                            ))}
                          </select>

                          {/* Property Path */}
                          <input
                            type="text"
                            value={as.targetProperty}
                            onChange={(e) => {
                              const updated = currentScenario.assertions.map((item) =>
                                item.id === as.id ? { ...item, targetProperty: e.target.value } : item,
                              );
                              handleSaveScenario({ ...currentScenario, assertions: updated });
                            }}
                            placeholder="property.path"
                            className="w-1/4 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] font-mono text-gray-200 focus:border-violet-500 focus:outline-none"
                          />

                          {/* Operator */}
                          <select
                            value={as.operator}
                            onChange={(e) => {
                              const updated = currentScenario.assertions.map((item) =>
                                item.id === as.id
                                  ? { ...item, operator: e.target.value as TestAssertion['operator'] }
                                  : item,
                              );
                              handleSaveScenario({ ...currentScenario, assertions: updated });
                            }}
                            className="w-1/4 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] text-gray-200 focus:border-violet-500 focus:outline-none"
                          >
                            <option value="equals">== Equals</option>
                            <option value="not_equals">!= Not Equal</option>
                            <option value="contains">Contains</option>
                            <option value="greater_than">&gt; Greater Than</option>
                            <option value="less_than">&lt; Less Than</option>
                            <option value="exists">Exists</option>
                          </select>

                          {/* Expected Value */}
                          <input
                            type="text"
                            value={as.expectedValue}
                            onChange={(e) => {
                              const updated = currentScenario.assertions.map((item) =>
                                item.id === as.id ? { ...item, expectedValue: e.target.value } : item,
                              );
                              handleSaveScenario({ ...currentScenario, assertions: updated });
                            }}
                            placeholder="Expected Value"
                            className="flex-1 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] font-mono text-gray-200 focus:border-violet-500 focus:outline-none"
                          />

                          {/* Delete assertion */}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = currentScenario.assertions.filter((item) => item.id !== as.id);
                              handleSaveScenario({ ...currentScenario, assertions: updated });
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Assertion Result Feedback */}
                        {result && (
                          <div className="pt-1 text-[11px] font-mono flex items-center justify-between border-t border-[#2a2a3e]/50">
                            <span className={result.passed ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                              {result.message}
                            </span>
                            <span className="text-gray-500 text-[10px]">
                              Actual: {JSON.stringify(result.actualValue)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
              Select or create a scenario to begin testing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
