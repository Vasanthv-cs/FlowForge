import { useState, useRef } from 'react';
import {
  Undo2,
  Redo2,
  CheckCircle2,
  Play,
  Square,
  Download,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen,
  Workflow,
  Save,
  FolderOpen,
  Plus,
  Loader2,
  Sparkles,
  FlaskConical,
  History,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowPersistence } from '@/store/persistence';
import type { SavedWorkflow } from '@/store/persistence';
import { idbStorage } from '@/lib/indexedDb';
import { validateImportedWorkflow } from '@/lib/workflowImportSchema';
import { TestLabModal } from '@/components/testLab/TestLabModal';
import { VersionHistoryModal } from '@/components/versioning/VersionHistoryModal';

export function TopNav() {
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const isSaved = useWorkflowStore((s) => s.isSaved);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const createNewWorkflow = useWorkflowStore((s) => s.createNewWorkflow);
  const loadWorkflowFromData = useWorkflowStore((s) => s.loadWorkflowFromData);

  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const canUndo = useWorkflowStore((s) => s.canUndo);
  const canRedo = useWorkflowStore((s) => s.canRedo);

  const validate = useWorkflowStore((s) => s.validate);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const cancelExecution = useWorkflowStore((s) => s.cancelExecution);
  const isRunning = useWorkflowStore((s) => s.isRunning);

  const setBottomTab = useWorkflowStore((s) => s.setBottomTab);
  const addLog = useWorkflowStore((s) => s.addLog);

  const toggleLeftSidebar = useWorkflowStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useWorkflowStore((s) => s.toggleRightSidebar);
  const toggleBottomPanel = useWorkflowStore((s) => s.toggleBottomPanel);
  const leftSidebarOpen = useWorkflowStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useWorkflowStore((s) => s.rightSidebarOpen);
  const bottomPanelOpen = useWorkflowStore((s) => s.bottomPanelOpen);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(workflowName);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [showTestLab, setShowTestLab] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [, setRefreshKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleValidate = () => {
    const errors = validate();
    setBottomTab('errors');
    if (!bottomPanelOpen) toggleBottomPanel();
    if (errors.length === 0) {
      addLog({ level: 'success', message: 'Workflow graph & configurations are valid! No errors found.' });
    } else {
      addLog({
        level: 'warn',
        message: `Validation detected ${errors.length} issue(s).`,
      });
    }
  };

  const handleRun = async () => {
    try {
      await runWorkflow();
    } catch {
      // Handled in store
    }
  };

  const handleExport = () => {
    const workflow: SavedWorkflow = {
      id: useWorkflowStore.getState().workflowId,
      name: workflowName,
      nodes,
      edges,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog({ level: 'info', message: `Exported workflow as "${a.download}".` });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const validation = validateImportedWorkflow(parsed);
        if (validation.success && validation.data) {
          loadWorkflowFromData(validation.data);
          addLog({
            level: 'success',
            message: `Successfully imported "${validation.data.name}" (${validation.data.nodes.length} nodes).`,
          });
        } else {
          addLog({
            level: 'error',
            message: validation.error || 'Import failed: Invalid workflow schema.',
          });
        }
      } catch (err) {
        addLog({
          level: 'error',
          message: `Import parse error: ${err instanceof Error ? err.message : 'Invalid JSON file'}`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSavedWorkflow = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    WorkflowPersistence.deleteWorkflow(id);
    await idbStorage.deleteWorkflow(id);
    addLog({ level: 'info', message: 'Deleted saved workflow from storage.' });
    setRefreshKey((k) => k + 1);
  };

  const loadDemoWorkflow = () => {
    const demoNodes = [
      {
        id: 'demo-trigger',
        type: 'workflowNode',
        position: { x: 80, y: 150 },
        data: {
          label: 'Manual Trigger',
          type: 'manual-trigger',
          category: 'trigger' as const,
          description: 'Starts workflow execution with manually supplied JSON data',
          icon: 'Play',
          color: '#10b981',
          config: {
            payload: '{\n  "userId": "usr_991",\n  "status": "active",\n  "plan": "pro"\n}',
          },
          inputs: [],
          outputs: [{ id: 'output', label: 'Payload', type: 'any' as const }],
          status: 'idle' as const,
        },
      },
      {
        id: 'demo-http',
        type: 'workflowNode',
        position: { x: 380, y: 150 },
        data: {
          label: 'Fetch GitHub Zen',
          type: 'http-request',
          category: 'data' as const,
          description: 'Execute an HTTP/REST request with custom method, headers and body',
          icon: 'Globe',
          color: '#3b82f6',
          config: {
            method: 'GET',
            url: 'https://api.github.com/zen',
            headers: { Accept: 'application/json' },
            body: '',
            timeoutMs: 5000,
          },
          inputs: [{ id: 'input', label: 'Trigger', type: 'any' as const }],
          outputs: [{ id: 'output', label: 'Response', type: 'object' as const }],
          status: 'idle' as const,
        },
      },
      {
        id: 'demo-condition',
        type: 'workflowNode',
        position: { x: 680, y: 150 },
        data: {
          label: 'Check User Status',
          type: 'condition',
          category: 'logic' as const,
          description: 'Evaluate a logical comparison to branch workflow into True and False paths',
          icon: 'GitBranch',
          color: '#f59e0b',
          config: {
            leftOperand: 'status',
            operator: 'equals',
            rightOperand: 'active',
          },
          inputs: [{ id: 'input', label: 'Input', type: 'any' as const }],
          outputs: [
            { id: 'true', label: 'True', type: 'any' as const },
            { id: 'false', label: 'False', type: 'any' as const },
          ],
          status: 'idle' as const,
        },
      },
      {
        id: 'demo-delay',
        type: 'workflowNode',
        position: { x: 980, y: 80 },
        data: {
          label: 'Wait 1 Second',
          type: 'delay',
          category: 'utility' as const,
          description: 'Pause execution for a specified duration in milliseconds',
          icon: 'Clock',
          color: '#8b5cf6',
          config: { delayMs: 1000 },
          inputs: [{ id: 'input', label: 'Input', type: 'any' as const }],
          outputs: [{ id: 'output', label: 'Output', type: 'any' as const }],
          status: 'idle' as const,
        },
      },
      {
        id: 'demo-console',
        type: 'workflowNode',
        position: { x: 1280, y: 80 },
        data: {
          label: 'Log Success',
          type: 'console-output',
          category: 'utility' as const,
          description: 'Capture, inspect and print the received payload to workflow logs',
          icon: 'Terminal',
          color: '#ec4899',
          config: { level: 'info', prefix: 'SUCCESS_PIPELINE' },
          inputs: [{ id: 'input', label: 'Data', type: 'any' as const }],
          outputs: [{ id: 'output', label: 'Passthrough', type: 'any' as const }],
          status: 'idle' as const,
        },
      },
    ];

    const demoEdges = [
      {
        id: 'e-trig-http',
        source: 'demo-trigger',
        target: 'demo-http',
        sourceHandle: 'output',
        targetHandle: 'input',
        type: 'smoothstep',
        animated: true,
      },
      {
        id: 'e-http-cond',
        source: 'demo-http',
        target: 'demo-condition',
        sourceHandle: 'output',
        targetHandle: 'input',
        type: 'smoothstep',
        animated: true,
      },
      {
        id: 'e-cond-delay',
        source: 'demo-condition',
        target: 'demo-delay',
        sourceHandle: 'true',
        targetHandle: 'input',
        type: 'smoothstep',
        animated: true,
      },
      {
        id: 'e-delay-log',
        source: 'demo-delay',
        target: 'demo-console',
        sourceHandle: 'output',
        targetHandle: 'input',
        type: 'smoothstep',
        animated: true,
      },
    ];

    loadWorkflowFromData({
      id: 'demo-onboarding-pipeline',
      name: 'Demo: User Onboarding Pipeline',
      nodes: demoNodes,
      edges: demoEdges,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setShowLoadMenu(false);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-[#1e1e2e] bg-[#13131d] px-3 select-none shrink-0 relative z-30">
      {/* ── Left section ─────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 shadow-md shadow-violet-900/30">
            <Workflow className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">
            FlowForge
          </span>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-[#2a2a3e]" />

        {/* Workflow Title Input */}
        {isEditingTitle ? (
          <input
            type="text"
            value={titleInput}
            autoFocus
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={() => {
              if (titleInput.trim()) {
                setWorkflowName(titleInput.trim());
              } else {
                setTitleInput(workflowName);
              }
              setIsEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (titleInput.trim()) setWorkflowName(titleInput.trim());
                setIsEditingTitle(false);
              } else if (e.key === 'Escape') {
                setTitleInput(workflowName);
                setIsEditingTitle(false);
              }
            }}
            className="h-7 px-2 text-xs font-medium text-gray-100 bg-[#1a1a2e] rounded border border-violet-500 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setTitleInput(workflowName);
              setIsEditingTitle(true);
            }}
            className="text-xs font-semibold text-gray-200 hover:text-violet-300 max-w-[200px] truncate px-1.5 py-0.5 rounded hover:bg-[#1a1a2e] transition-colors text-left"
            title="Click to rename workflow"
          >
            {workflowName}
          </button>
        )}

        {/* Save button & state indicator */}
        <button
          onClick={() => saveWorkflow()}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#1e1e2e] transition-colors text-xs"
          title="Save workflow (Ctrl+S)"
        >
          {isSaved ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <Save className="h-3 w-3" /> Saved
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
              <Save className="h-3 w-3 animate-pulse" /> Unsaved (Ctrl+S)
            </span>
          )}
        </button>

        {/* Workflows / Templates Dropdown Trigger */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLoadMenu(!showLoadMenu)}
            className="h-7 px-2 text-xs text-gray-400 hover:text-gray-200"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Workflows
          </Button>

          {showLoadMenu && (
            <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-[#2a2a3e] bg-[#1a1a2e] p-2 shadow-xl z-50 space-y-1">
              <button
                onClick={() => {
                  createNewWorkflow();
                  setShowLoadMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-gray-300 hover:bg-[#252538] hover:text-white transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-400" />
                New Blank Workflow
              </button>

              <button
                onClick={loadDemoWorkflow}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-gray-300 hover:bg-[#252538] hover:text-white transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                Load Onboarding Demo Pipeline
              </button>

              <div className="border-t border-[#2a2a3e] my-1" />

              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Saved Workflows
              </div>

              {WorkflowPersistence.listWorkflows().length === 0 ? (
                <div className="px-2.5 py-1 text-[11px] text-gray-500 italic">
                  No saved workflows yet
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {WorkflowPersistence.listWorkflows().map((wf) => (
                    <div
                      key={wf.id}
                      className="group flex items-center justify-between px-2.5 py-1 rounded text-xs text-gray-300 hover:bg-[#252538] transition-colors"
                    >
                      <button
                        onClick={() => {
                          loadWorkflowFromData(wf);
                          setShowLoadMenu(false);
                        }}
                        className="flex-1 truncate text-left hover:text-white"
                        title={wf.name}
                      >
                        <span className="truncate">{wf.name}</span>
                        <span className="text-[10px] text-gray-500 ml-1.5 font-mono">
                          ({wf.nodes.length}n)
                        </span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteSavedWorkflow(e, wf.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-[#1a1a2e] transition-all ml-1"
                        title="Delete saved workflow"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Center section ───────────────────────── */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLeftSidebar}
            >
              {leftSidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Node Library</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleBottomPanel}
            >
              {bottomPanelOpen ? (
                <PanelBottomClose className="h-4 w-4" />
              ) : (
                <PanelBottomOpen className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Bottom Panel</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRightSidebar}
            >
              {rightSidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Inspector</TooltipContent>
        </Tooltip>

        <div className="h-5 w-px bg-[#2a2a3e] mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!canUndo()}
              onClick={undo}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!canRedo()}
              onClick={redo}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Right section ────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTestLab(true)}
          className="text-xs text-violet-300 hover:text-violet-100 hover:bg-violet-900/20 flex items-center gap-1.5"
          title="Workflow Testing Laboratory"
        >
          <FlaskConical className="h-3.5 w-3.5 text-violet-400" />
          Test Lab
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowVersionHistory(true)}
          className="text-xs text-indigo-300 hover:text-indigo-100 hover:bg-indigo-900/20 flex items-center gap-1.5"
          title="Version History & Rollbacks"
        >
          <History className="h-3.5 w-3.5 text-indigo-400" />
          Versions
        </Button>

        <div className="h-4 w-px bg-[#2a2a3e] mx-0.5" />

        <Button variant="secondary" size="sm" onClick={handleValidate}>
          <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />
          Validate
        </Button>

        {isRunning ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={cancelExecution}
            className="flex items-center gap-1.5"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Cancel Run
          </Button>
        ) : (
          <Button
            variant="success"
            size="sm"
            onClick={handleRun}
            className="flex items-center gap-1.5 shadow-sm"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            Run
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={handleExport} title="Download JSON">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Import JSON"
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      {/* Stage 6 Testing Laboratory Modal */}
      <TestLabModal
        isOpen={showTestLab}
        onClose={() => setShowTestLab(false)}
      />

      {/* Stage 6 Version History Modal */}
      <VersionHistoryModal
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
      />
    </header>
  );
}
