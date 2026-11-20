import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import type {
  NodeExecutionRecord,
  WorkflowRunResult,
  EngineRunOptions,
  ExecutionContext,
  TimelineEvent,
} from './types';
import { analyzeWorkflowGraph } from './graph';
import { NodeRegistry } from './registry';
import { validateNodeConfig } from '@/lib/nodeValidation';

export class WorkflowEngine {
  private abortController: AbortController | null = null;

  /**
   * Runs the workflow DAG end-to-end with concurrency control, dependency resolution,
   * timeline event generation, condition branching, and timeout protection.
   */
  public async executeWorkflow(
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    options: EngineRunOptions = {},
  ): Promise<WorkflowRunResult> {
    const startTime = Date.now();
    const executionId = `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const maxConcurrency = options.maxConcurrency ?? 4;
    const timeoutMs = options.timeoutMs ?? 300000; // 5 min default
    const timeline: TimelineEvent[] = [];

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
    const nodeMap = new Map<string, WorkflowNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const records: Record<string, NodeExecutionRecord> = {};
    for (const node of nodes) {
      records[node.id] = {
        nodeId: node.id,
        nodeLabel: node.data.label,
        nodeType: node.data.type,
        state: 'pending',
      };
      // Notify initial pending state
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

        // If no nodes are ready and none are running, check if we're done or stuck
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
            // Node must be skipped
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

            // Decrement in-degree for its children
            const children = analysis.dependentMap[nextNodeId] ?? [];
            for (const childId of children) {
              inDegree[childId]--;
            }

            // Immediately schedule check for newly freed children
            setTimeout(scheduleNext, 0);
            continue;
          }

          // Node is truly ready to run!
          runningCount++;
          const nodeStartTime = Date.now();
          updateNodeState(nextNodeId, {
            state: 'running',
            startedAt: nodeStartTime,
          });

          emitTimeline('node_started', `Started "${node.data.label}"`, node.id, node.data.label);
          log('info', `Executing node "${node.data.label}"...`, node.id, node.data.label);

          // Prepare aggregated incoming payload from upstream parents
          let incomingPayload: Record<string, unknown> = {};
          for (const uid of upstreamIds) {
            const out = nodeOutputs[uid];
            if (out) {
              Object.assign(incomingPayload, out);
            }
          }

          // Override trigger payload if provided by Test Laboratory
          if (node.data.category === 'trigger' && options.overrideTriggerPayload) {
            incomingPayload = { ...options.overrideTriggerPayload };
          }

          // Execute node in background task
          (async () => {
            try {
              // Create context
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

              const executor = NodeRegistry.getExecutor(node.data.type);
              const context: ExecutionContext = {
                executionId,
                workflowId,
                node: contextNode,
                upstreamOutputs: nodeOutputs,
                incomingPayload,
                emitLog: (lvl, msg) => log(lvl, msg, node.id, node.data.label),
                signal,
              };

              const result = await executor.execute(context);
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
                });
                emitTimeline(
                  'node_completed',
                  `Completed "${node.data.label}" (${durationMs}ms)`,
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
                  error: result.error ?? 'Execution failed',
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

              // Decrement in-degree for its children
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
