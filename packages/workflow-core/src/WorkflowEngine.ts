import type { BaseWorkflowNode, BaseWorkflowEdge } from '@flowforge/workflow-schema';
import type {
  NodeExecutionRecord,
  NodeExecutionResult,
  ExecutionContext,
  INodeRegistry,
} from '@flowforge/node-sdk';
import type {
  WorkflowRunResult,
  EngineRunOptions,
  TimelineEvent,
} from './types';
import { analyzeWorkflowGraph } from './graph';
import { validateNodeConfig } from './validation';

export class WorkflowEngine<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge,
> {
  private abortController: AbortController | null = null;
  private readonly registry?: INodeRegistry;

  constructor(registry?: INodeRegistry) {
    this.registry = registry;
  }

  /**
   * Runs the workflow DAG end-to-end with concurrency control, dependency resolution,
   * timeline event generation, condition branching, and timeout protection.
   */
  public async executeWorkflow(
    workflowId: string,
    nodes: TNode[],
    edges: TEdge[],
    options: EngineRunOptions = {},
    customRegistry?: INodeRegistry,
  ): Promise<WorkflowRunResult> {
    const startTime = Date.now();
    const executionId = `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const maxConcurrency = options.maxConcurrency ?? 4;
    const timeoutMs = options.timeoutMs ?? 300000; // 5 min default
    const timeline: TimelineEvent[] = [];

    const activeRegistry = customRegistry ?? this.registry;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const timeoutTimer = setTimeout(() => {
      this.abortController?.abort(new Error(`Workflow execution exceeded timeout of ${timeoutMs / 1000}s.`));
    }, timeoutMs);

    // Logging helper
    const log = (level: 'info' | 'warn' | 'error' | 'log', message: string, nodeId?: string, nodeLabel?: string) => {
      options.onLog?.({ level, message, nodeId, nodeLabel });
    };

    // Timeline event helper
    let eventCounter = 0;
    const emitTimeline = (
      type: TimelineEvent['type'],
      message: string,
      nodeId?: string,
      nodeLabel?: string,
      durationMs?: number,
      details?: Record<string, unknown>,
    ) => {
      eventCounter++;
      const ev: TimelineEvent = {
        id: `tl-${Date.now()}-${eventCounter}`,
        type,
        timestamp: Date.now(),
        message,
        nodeId,
        nodeLabel,
        durationMs,
        details,
      };
      timeline.push(ev);
      options.onTimelineEvent?.(ev);
    };

    log('info', `Initializing workflow execution engine (ID: ${executionId})...`);
    emitTimeline('workflow_started', `Workflow execution initiated (ID: ${executionId})`);

    // 1. Static Workflow & DAG Analysis
    const analysis = analyzeWorkflowGraph(nodes, edges);
    if (!analysis.isValid) {
      clearTimeout(timeoutTimer);
      const combinedError = analysis.errors.join(' | ');
      log('error', `Workflow pre-execution validation failed: ${combinedError}`);
      emitTimeline('workflow_completed', `Execution failed: ${combinedError}`, undefined, undefined, Date.now() - startTime);

      return {
        executionId,
        success: false,
        startedAt: startTime,
        completedAt: Date.now(),
        durationMs: Date.now() - startTime,
        nodesExecuted: 0,
        nodeRecords: {},
        timeline,
        finalOutputs: {},
        error: combinedError,
      };
    }

    // 2. Validate node configurations with Zod
    for (const node of nodes) {
      const configErrors = validateNodeConfig(node);
      if (configErrors.length > 0) {
        clearTimeout(timeoutTimer);
        const err = `Configuration invalid in "${node.data.label}": ${configErrors.map((e) => e.message).join(', ')}`;
        log('error', err, node.id, node.data.label);
        emitTimeline('workflow_completed', err, node.id, node.data.label, Date.now() - startTime);

        return {
          executionId,
          success: false,
          startedAt: startTime,
          completedAt: Date.now(),
          durationMs: Date.now() - startTime,
          nodesExecuted: 0,
          nodeRecords: {},
          timeline,
          finalOutputs: {},
          error: err,
        };
      }
    }

    // 3. Initialize Node Records & State Tracker
    const nodeMap = new Map<string, TNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const records: Record<string, NodeExecutionRecord> = {};
    for (const node of nodes) {
      records[node.id] = {
        nodeId: node.id,
        nodeLabel: node.data.label,
        nodeType: node.data.type,
        state: 'pending',
      };
      options.onNodeStateChange?.(records[node.id]);
    }

    const updateNodeState = (nodeId: string, update: Partial<NodeExecutionRecord>) => {
      records[nodeId] = { ...records[nodeId], ...update };
      options.onNodeStateChange?.(records[nodeId]);
    };

    // Store node outputs: nodeId -> payload
    const nodeOutputs: Record<string, Record<string, unknown>> = {};

    // 4. Dependency-Aware Concurrency Scheduler
    const inDegree: Record<string, number> = {};
    for (const node of nodes) {
      inDegree[node.id] = analysis.dependencyMap[node.id]?.length ?? 0;
    }

    let runningCount = 0;
    let completedCount = 0;
    let hasEngineError = false;
    let engineErrorMessage: string | undefined;

    // Initialize Reused Node Records for Time-Travel Replay
    if (options.reusedNodeRecords && Object.keys(options.reusedNodeRecords).length > 0) {
      for (const [reusedId, reusedRec] of Object.entries(options.reusedNodeRecords)) {
        if (!nodeMap.has(reusedId)) continue;
        const node = nodeMap.get(reusedId)!;
        records[reusedId] = {
          ...reusedRec,
          state: 'success',
          isReused: true,
          durationMs: 0,
        };
        if (reusedRec.outputData) {
          nodeOutputs[reusedId] = { ...reusedRec.outputData };
        }
        completedCount++;
        emitTimeline(
          'node_completed',
          `Reused execution data for "${node.data.label}" from run ${options.replayedFromExecutionId?.slice(0, 8) || 'history'}`,
          node.id,
          node.data.label,
          0,
          {
            reused: true,
            replayedFromExecutionId: options.replayedFromExecutionId,
          }
        );
        log(
          'info',
          `[Replay] Reused recorded output for "${node.data.label}" without re-executing.`,
          node.id,
          node.data.label
        );
        options.onNodeStateChange?.(records[reusedId]);

        // Decrement inDegree of dependent child nodes
        const children = analysis.dependentMap[reusedId] ?? [];
        for (const childId of children) {
          inDegree[childId]--;
        }
      }
    }

    const evaluateReadyNodes = (): string[] => {
      const ready: string[] = [];
      for (const node of nodes) {
        if (records[node.id].state === 'pending' && inDegree[node.id] === 0) {
          ready.push(node.id);
        }
      }
      return ready;
    };

    log(
      'info',
      `Starting DAG execution: ${nodes.length} nodes, concurrency limit: ${maxConcurrency}.`,
    );

    // Main execution loop
    await new Promise<void>((resolve) => {
      const scheduleNext = () => {
        if (signal.aborted) {
          hasEngineError = true;
          engineErrorMessage = signal.reason?.message ?? 'Workflow execution aborted';
          resolve();
          return;
        }

        if (completedCount === nodes.length) {
          resolve();
          return;
        }

        const readyNodeIds = evaluateReadyNodes();

        if (readyNodeIds.length === 0 && runningCount === 0) {
          resolve();
          return;
        }

        while (readyNodeIds.length > 0 && runningCount < maxConcurrency) {
          const nextNodeId = readyNodeIds.shift()!;
          const node = nodeMap.get(nextNodeId)!;

          // Check if any upstream parent failed or was skipped
          const upstreamIds = analysis.dependencyMap[nextNodeId] ?? [];
          const hasFailedParent = upstreamIds.some((uid) => records[uid].state === 'failed');
          const hasSkippedParent = upstreamIds.some((uid) => records[uid].state === 'skipped');

          // Check if the edge leading to this node is from an unselected condition branch
          const incomingEdges = edges.filter((e) => e.target === nextNodeId);
          const isFromInactiveBranch = incomingEdges.some((edge) => {
            const parentRecord = records[edge.source];
            if (parentRecord?.nodeType === 'condition' && parentRecord.selectedBranch) {
              const handleUsed = edge.sourceHandle ?? 'true';
              return handleUsed !== parentRecord.selectedBranch;
            }
            return false;
          });

          if (hasFailedParent || hasSkippedParent || isFromInactiveBranch) {
            updateNodeState(nextNodeId, {
              state: 'skipped',
              completedAt: Date.now(),
              durationMs: 0,
            });
            emitTimeline(
              'node_skipped',
              `Node "${node.data.label}" skipped (branch not taken or parent failed)`,
              node.id,
              node.data.label,
              0,
            );
            log(
              'warn',
              `Node "${node.data.label}" skipped (upstream dependency failed or branch not selected).`,
              node.id,
              node.data.label,
            );
            completedCount++;

            const children = analysis.dependentMap[nextNodeId] ?? [];
            for (const childId of children) {
              inDegree[childId]--;
            }

            setTimeout(scheduleNext, 0);
            continue;
          }

          runningCount++;
          const nodeStartTime = Date.now();
          updateNodeState(nextNodeId, {
            state: 'running',
            startedAt: nodeStartTime,
          });

          emitTimeline('node_started', `Started "${node.data.label}"`, node.id, node.data.label);
          log('info', `Executing node "${node.data.label}"...`, node.id, node.data.label);

          let incomingPayload: Record<string, unknown> = {};
          for (const uid of upstreamIds) {
            const out = nodeOutputs[uid];
            if (out) {
              Object.assign(incomingPayload, out);
            }
          }

          if (node.data.category === 'trigger' && options.overrideTriggerPayload) {
            incomingPayload = { ...options.overrideTriggerPayload };
          }

          if (options.editedNodeInputs?.[nextNodeId]) {
            incomingPayload = { ...incomingPayload, ...options.editedNodeInputs[nextNodeId] };
          }

          (async () => {
            try {
              const contextNode = (node.data.category === 'trigger' && options.overrideTriggerPayload)
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      config: {
                        ...node.data.config,
                        payload: JSON.stringify(options.overrideTriggerPayload),
                      },
                    },
                  }
                : node;

              if (!activeRegistry) {
                throw new Error('No NodeRegistry configured for WorkflowEngine.');
              }

              const executor = activeRegistry.getExecutor(node.data.type);
              const context: ExecutionContext<TNode, TEdge> = {
                executionId,
                workflowId,
                workspaceId: options.workspaceId,
                node: contextNode,
                upstreamOutputs: nodeOutputs,
                incomingPayload,
                emitLog: (lvl, msg) => log(lvl, msg, node.id, node.data.label),
                signal,
              };

              let result: NodeExecutionResult;
              let isMocked = false;

              // Check for Deterministic Test Mode mock response or Safe Replay Mode auto-mock
              let mock = options.mockResponses?.[nextNodeId];
              const isSafeReplay =
                options.safeReplayMode !== false &&
                Boolean(options.replayedFromExecutionId || options.replayFromNodeId);

              if (
                !mock &&
                isSafeReplay &&
                (node.data.type === 'http-request' || node.data.type === 'webhook-response')
              ) {
                const recorded = options.originalNodeRecords?.[nextNodeId];
                if (recorded && recorded.outputData) {
                  mock = {
                    enabled: true,
                    statusCode: (recorded.outputData.status as number) ?? 200,
                    body: recorded.outputData.data ?? recorded.outputData,
                    headers: (recorded.outputData.headers as Record<string, string>) ?? {
                      'content-type': 'application/json',
                    },
                  };
                }
              }

              if (mock && mock.enabled) {
                isMocked = true;
                const reasonTag = isSafeReplay ? '[Safe Replay]' : '[Test Mode]';
                log(
                  'info',
                  `${reasonTag} Using recorded mock response for node "${node.data.label}". No external request dispatched.`,
                  node.id,
                  node.data.label,
                );

                const status = mock.statusCode ?? 200;
                let parsedBody = mock.body;
                if (typeof parsedBody === 'string') {
                  try {
                    parsedBody = JSON.parse(parsedBody);
                  } catch {
                    // Retain literal text if not JSON
                  }
                }
                const mockHeaders = mock.headers ?? { 'content-type': 'application/json' };
                const mockOutput: Record<string, unknown> = {
                  status,
                  statusText: status >= 200 && status < 300 ? 'OK' : 'Mocked Response',
                  headers: mockHeaders,
                  data: parsedBody ?? {},
                  ok: status >= 200 && status < 400,
                  isMocked: true,
                };

                result = {
                  success: status >= 200 && status < 400,
                  output: mockOutput,
                  error: status >= 400 ? `Mocked HTTP response returned status ${status}` : undefined,
                };
              } else {
                result = await executor.execute(context);
              }

              const durationMs = Date.now() - nodeStartTime;

              if (result.success) {
                nodeOutputs[nextNodeId] = result.output ?? {};
                updateNodeState(nextNodeId, {
                  state: 'success',
                  completedAt: Date.now(),
                  durationMs,
                  inputData: incomingPayload,
                  outputData: result.output,
                  selectedBranch: result.selectedBranch,
                  isMocked,
                  isReused: false,
                });
                emitTimeline(
                  'node_completed',
                  isMocked
                    ? `Completed "${node.data.label}" (MOCKED, ${durationMs}ms)`
                    : `Completed "${node.data.label}" (${durationMs}ms)`,
                  node.id,
                  node.data.label,
                  durationMs,
                  result.output,
                );
                log(
                  'info',
                  `Node "${node.data.label}" completed in ${durationMs}ms.`,
                  node.id,
                  node.data.label,
                );
              } else {
                hasEngineError = true;
                updateNodeState(nextNodeId, {
                  state: 'failed',
                  completedAt: Date.now(),
                  durationMs,
                  inputData: incomingPayload,
                  outputData: result.output,
                  error: result.error ?? 'Execution failed',
                  isMocked,
                  isReused: false,
                });
                emitTimeline(
                  'node_failed',
                  `Failed "${node.data.label}": ${result.error}`,
                  node.id,
                  node.data.label,
                  durationMs,
                );
                log(
                  'error',
                  `Node "${node.data.label}" failed: ${result.error}`,
                  node.id,
                  node.data.label,
                );
              }
            } catch (err: unknown) {
              const durationMs = Date.now() - nodeStartTime;
              const errorMsg = err instanceof Error ? err.message : 'Unknown runtime failure';
              hasEngineError = true;
              updateNodeState(nextNodeId, {
                state: 'failed',
                completedAt: Date.now(),
                durationMs,
                inputData: incomingPayload,
                error: errorMsg,
              });
              emitTimeline(
                'node_failed',
                `Uncaught exception in "${node.data.label}": ${errorMsg}`,
                node.id,
                node.data.label,
                durationMs,
              );
              log(
                'error',
                `Node "${node.data.label}" encountered uncaught error: ${errorMsg}`,
                node.id,
                node.data.label,
              );
            } finally {
              runningCount--;
              completedCount++;

              const children = analysis.dependentMap[nextNodeId] ?? [];
              for (const childId of children) {
                inDegree[childId]--;
              }

              scheduleNext();
            }
          })();
        }
      };

      scheduleNext();
    });

    clearTimeout(timeoutTimer);
    const durationMs = Date.now() - startTime;
    const finalSuccess = !hasEngineError && !signal.aborted;

    emitTimeline(
      'workflow_completed',
      finalSuccess
        ? `Workflow finished successfully in ${durationMs}ms.`
        : `Workflow finished with errors in ${durationMs}ms.`,
      undefined,
      undefined,
      durationMs,
    );

    log(
      finalSuccess ? 'info' : 'warn',
      `Workflow execution finished: ${finalSuccess ? 'SUCCESS' : 'FAILED'} in ${durationMs}ms (${completedCount}/${nodes.length} nodes processed).`,
    );

    return {
      executionId,
      success: finalSuccess,
      startedAt: startTime,
      completedAt: Date.now(),
      durationMs,
      nodesExecuted: completedCount,
      nodeRecords: records,
      timeline,
      finalOutputs: nodeOutputs,
      error: engineErrorMessage,
    };
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort(new Error('Execution manually cancelled by user'));
      this.abortController = null;
    }
  }
}
