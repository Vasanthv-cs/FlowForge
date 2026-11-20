import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { useWorkflowStore } from '@/store/workflowStore';
import { validateNodeConfig } from '@/lib/nodeValidation';
import { cn } from '@/lib/utils';
import type { WorkflowNode as WorkflowNodeType, WorkflowNodeData } from '@/types/workflow';
import type {
  HttpRequestConfig,
  TransformDataConfig,
  ConditionConfig,
  DelayConfig,
  ConsoleOutputConfig,
  ManualTriggerConfig,
} from '@/types/nodeConfigs';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  PauseCircle,
  HelpCircle,
} from 'lucide-react';

function WorkflowNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);

  // Per-node validation status for visual alert
  const hasErrors = useMemo(() => {
    const dummyNode: WorkflowNodeType = {
      id,
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: nodeData,
    };
    return validateNodeConfig(dummyNode).length > 0;
  }, [id, nodeData]);

  // Contextual live summary for node card
  const renderConfigPreview = () => {
    const config = nodeData.config;
    switch (nodeData.type) {
      case 'manual-trigger': {
        const c = config as unknown as ManualTriggerConfig;
        const isSet = c.payload && c.payload.trim().length > 0;
        return (
          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-900/40">
            <span>JSON Payload</span>
            <span className="text-[10px] text-gray-400 ml-auto font-sans">
              {isSet ? 'Configured' : 'Empty'}
            </span>
          </div>
        );
      }
      case 'http-request': {
        const c = config as unknown as HttpRequestConfig;
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-mono bg-[#13131d] px-2 py-1 rounded border border-[#2a2a3e] truncate">
            <span
              className={cn(
                'px-1 py-0.5 text-[9px] rounded font-bold uppercase shrink-0',
                c.method === 'GET' && 'bg-blue-500/20 text-blue-400',
                c.method === 'POST' && 'bg-emerald-500/20 text-emerald-400',
                c.method === 'PUT' && 'bg-amber-500/20 text-amber-400',
                c.method === 'DELETE' && 'bg-red-500/20 text-red-400',
                c.method === 'PATCH' && 'bg-violet-500/20 text-violet-400',
              )}
            >
              {c.method ?? 'GET'}
            </span>
            <span className="text-gray-300 truncate text-[10px]">
              {c.url ? c.url.replace(/^https?:\/\//, '') : 'Set URL...'}
            </span>
          </div>
        );
      }
      case 'transform-data': {
        const c = config as unknown as TransformDataConfig;
        return (
          <div className="text-[10px] font-mono bg-[#13131d] px-2 py-1 rounded border border-[#2a2a3e] text-cyan-300 truncate">
            <span className="text-gray-400">{c.mode}: </span>
            <span>{c.propertyPath ? `${c.propertyPath} → ` : ''}{c.outputKey || 'result'}</span>
          </div>
        );
      }
      case 'condition': {
        const c = config as unknown as ConditionConfig;
        const opSymbol =
          c.operator === 'equals'
            ? '=='
            : c.operator === 'not_equals'
              ? '!='
              : c.operator === 'greater_than'
                ? '>'
                : c.operator === 'less_than'
                  ? '<'
                  : c.operator;
        return (
          <div className="flex items-center gap-1 text-[10px] font-mono bg-[#13131d] px-2 py-1 rounded border border-[#2a2a3e] text-amber-300 truncate">
            <span className="truncate max-w-[50px]">{c.leftOperand || 'left'}</span>
            <span className="text-gray-400">{opSymbol}</span>
            <span className="truncate max-w-[50px]">{c.rightOperand || 'right'}</span>
          </div>
        );
      }
      case 'delay': {
        const c = config as unknown as DelayConfig;
        return (
          <div className="flex items-center gap-1 text-[11px] font-mono text-violet-300 bg-violet-950/40 px-2 py-1 rounded border border-violet-900/40">
            <Clock className="h-3 w-3 shrink-0 text-violet-400" />
            <span>{(c.delayMs ?? 1000).toLocaleString()} ms</span>
          </div>
        );
      }
      case 'console-output': {
        const c = config as unknown as ConsoleOutputConfig;
        return (
          <div className="flex items-center gap-1 text-[10px] font-mono bg-[#13131d] px-2 py-1 rounded border border-[#2a2a3e] text-pink-300">
            <span className="text-gray-400 uppercase">[{c.level ?? 'info'}]</span>
            <span className="truncate">{c.prefix || 'FLOWFORGE'}</span>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const status = nodeData.status ?? 'idle';

  return (
    <div
      onClick={() => setSelectedNodeId(id)}
      className={cn(
        'group relative rounded-xl border bg-[#1a1a2e] shadow-xl transition-all min-w-[210px] max-w-[260px]',
        // Normal selection state
        selected
          ? 'ring-2 ring-violet-500/60 shadow-violet-500/20 border-violet-400'
          : 'border-[#2a2a3e] hover:border-[#3a3a4e]',
        // STAGE 5 Debugger Status Color Coding
        status === 'pending' && 'border-gray-500/60 bg-[#161622] text-gray-400',
        status === 'running' && 'border-blue-500 ring-2 ring-blue-500/40 shadow-blue-500/20 animate-pulse',
        status === 'success' && 'border-emerald-500 ring-1 ring-emerald-500/40 shadow-emerald-500/10',
        status === 'failed' && 'border-red-500 ring-2 ring-red-500/40 shadow-red-500/20',
        status === 'skipped' && 'border-amber-400/80 ring-1 ring-amber-400/30 opacity-70 bg-[#1c1a17]',
      )}
    >
      {/* Category accent bar */}
      <div
        className="absolute top-0 left-3 right-3 h-[2px] rounded-b-full transition-colors"
        style={{
          backgroundColor:
            status === 'running'
              ? '#3b82f6'
              : status === 'success'
                ? '#10b981'
                : status === 'failed'
                  ? '#ef4444'
                  : status === 'skipped'
                    ? '#f59e0b'
                    : nodeData.color,
        }}
      />

      {/* Main card body */}
      <div className="p-3 space-y-2">
        {/* Node header */}
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border shadow-sm"
            style={{
              borderColor: nodeData.color + '40',
              backgroundColor: nodeData.color + '15',
            }}
          >
            <DynamicIcon
              name={nodeData.icon}
              className="h-3.5 w-3.5"
              style={{ color: nodeData.color }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-200 truncate leading-snug">
              {nodeData.label}
            </p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
              {nodeData.category}
            </p>
          </div>

          {/* Validation issue alert indicator */}
          {hasErrors && (
            <div title="Configuration has validation issues">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            </div>
          )}

          {/* STAGE 5 Visual Execution Status Badges */}
          {status !== 'idle' && (
            <div className="shrink-0 flex items-center">
              {status === 'pending' && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                  <HelpCircle className="h-2.5 w-2.5" /> PENDING
                </span>
              )}
              {status === 'running' && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40 animate-pulse font-bold">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> RUNNING
                </span>
              )}
              {status === 'success' && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-2.5 w-2.5" /> SUCCESS
                </span>
              )}
              {status === 'failed' && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                  <XCircle className="h-2.5 w-2.5" /> FAILED
                </span>
              )}
              {status === 'skipped' && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <PauseCircle className="h-2.5 w-2.5" /> SKIPPED
                </span>
              )}
            </div>
          )}
        </div>

        {/* Live contextual configuration preview */}
        {renderConfigPreview()}
      </div>

      {/* Input handles (Left) */}
      {nodeData.inputs.map((inp, idx) => {
        const topPercent = ((idx + 1) / (nodeData.inputs.length + 1)) * 100;
        return (
          <div
            key={inp.id}
            className="absolute left-0 -translate-x-1/2 flex items-center"
            style={{ top: `${topPercent}%` }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={inp.id}
              className="!relative !left-0 !top-0 !transform-none !w-3 !h-3 !border-2 !border-[#4a4a6a] !bg-[#1a1a2e] hover:!border-violet-400 hover:!bg-violet-400/30 transition-all cursor-crosshair"
            />
          </div>
        );
      })}

      {/* Output handles (Right) */}
      {nodeData.outputs.map((out, idx) => {
        const topPercent = ((idx + 1) / (nodeData.outputs.length + 1)) * 100;
        const isTrueBranch = out.id === 'true';
        const isFalseBranch = out.id === 'false';

        return (
          <div
            key={out.id}
            className="absolute right-0 translate-x-1/2 flex items-center"
            style={{ top: `${topPercent}%` }}
          >
            {nodeData.outputs.length > 1 && (
              <span
                className={cn(
                  'absolute right-4 text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded select-none pointer-events-none',
                  isTrueBranch && 'text-emerald-400 bg-emerald-950/60',
                  isFalseBranch && 'text-rose-400 bg-rose-950/60',
                )}
              >
                {out.label}
              </span>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={out.id}
              style={{
                borderColor: isTrueBranch
                  ? '#10b981'
                  : isFalseBranch
                    ? '#f43f5e'
                    : '#4a4a6a',
              }}
              className="!relative !right-0 !top-0 !transform-none !w-3 !h-3 !border-2 !bg-[#1a1a2e] hover:!border-emerald-400 hover:!bg-emerald-400/30 transition-all cursor-crosshair"
            />
          </div>
        );
      })}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
