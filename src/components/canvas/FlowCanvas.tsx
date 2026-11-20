import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type ReactFlowInstance,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowNode } from '@/components/canvas/WorkflowNode';
import { useWorkflowStore } from '@/store/workflowStore';
import { validateConnection } from '@/lib/connectionValidation';
import type { WorkflowNode as WorkflowNodeType } from '@/types/workflow';

export function FlowCanvas() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const setSelectedEdgeId = useWorkflowStore((s) => s.setSelectedEdgeId);
  const pushSnapshot = useWorkflowStore((s) => s.pushSnapshot);

  const rfInstance = useRef<ReactFlowInstance<WorkflowNodeType> | null>(null);

  const nodeTypes = useMemo(
    () => ({
      workflowNode: WorkflowNode,
    }),
    [],
  );

  const onInit = useCallback((instance: ReactFlowInstance<WorkflowNodeType>) => {
    rfInstance.current = instance;
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/flowforge-node-type');
      if (!type || !rfInstance.current) return;

      const position = rfInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [addNode],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: WorkflowNodeType[]; edges: Edge[] }) => {
      if (selectedNodes.length === 1) {
        setSelectedNodeId(selectedNodes[0].id);
      } else if (selectedNodes.length === 0) {
        setSelectedNodeId(null);
      }

      if (selectedEdges.length === 1) {
        setSelectedEdgeId(selectedEdges[0].id);
      } else if (selectedEdges.length === 0) {
        setSelectedEdgeId(null);
      }
    },
    [setSelectedNodeId, setSelectedEdgeId],
  );

  const onNodeDragStart = useCallback(() => {
    pushSnapshot();
  }, [pushSnapshot]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setSelectedNodeId, setSelectedEdgeId]);

  // Connection validation rule evaluator for interactive line dragging
  const handleIsValidConnection = useCallback(
    (connection: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
      return validateConnection(connection as Connection, nodes, edges).isValid;
    },
    [nodes, edges],
  );

  return (
    <div className="flex-1 h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={handleIsValidConnection}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onSelectionChange={onSelectionChange}
        onNodeDragStart={onNodeDragStart}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
        }}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-[#0f0f17]"
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#2a2a3e"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as Record<string, unknown>;
            return (data?.color as string) ?? '#4a4a6a';
          }}
          maskColor="rgba(15, 15, 23, 0.8)"
          position="bottom-right"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Empty State Overlay */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center p-6 select-none">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1a2e] border border-[#2a2a3e] flex items-center justify-center mb-4 text-violet-400 shadow-xl shadow-black/40">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-200 mb-1">
            Build Your Workflow
          </h3>
          <p className="text-xs text-gray-400 max-w-sm leading-relaxed mb-4">
            Drag nodes from the left library onto the canvas, or load a pre-built demo pipeline from the top menu.
          </p>
          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono">
            <span className="px-1.5 py-0.5 rounded bg-[#1e1e2e] border border-[#2a2a3e]">Ctrl+S Save</span>
            <span className="px-1.5 py-0.5 rounded bg-[#1e1e2e] border border-[#2a2a3e]">Ctrl+Z Undo</span>
            <span className="px-1.5 py-0.5 rounded bg-[#1e1e2e] border border-[#2a2a3e]">Ctrl+D Duplicate</span>
          </div>
        </div>
      )}
    </div>
  );
}
