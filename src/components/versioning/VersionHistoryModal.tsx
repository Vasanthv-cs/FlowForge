import { useState, useEffect, useCallback } from 'react';
import {
  X,
  History,
  RotateCcw,
  Plus,
  Calendar,
  Layers,
  GitBranch,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkflowStore } from '@/store/workflowStore';
import { idbStorage } from '@/lib/indexedDb';
import type { WorkflowVersion } from '@/types/testLab';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VersionHistoryModal({ isOpen, onClose }: VersionHistoryModalProps) {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const loadWorkflowFromData = useWorkflowStore((s) => s.loadWorkflowFromData);
  const addLog = useWorkflowStore((s) => s.addLog);

  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [versionTag, setVersionTag] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  // Load versions whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const list = await idbStorage.listVersions(workflowId);
      setVersions(list);
      setVersionTag(`v1.${list.length}`);
    })();
  }, [isOpen, workflowId]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionTag.trim()) return;

    setIsCreating(true);
    try {
      const newVersion: WorkflowVersion = {
        id: `ver-${Date.now()}`,
        workflowId,
        versionTag: versionTag.trim(),
        description: description.trim() || 'Manual version snapshot',
        nodesCount: nodes.length,
        edgesCount: edges.length,
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        savedAt: Date.now(),
      };

      await idbStorage.saveVersion(newVersion);
      const updated = await idbStorage.listVersions(workflowId);
      setVersions(updated);
      setVersionTag(`v1.${updated.length}`);
      setDescription('');
      addLog({
        level: 'info',
        message: `Created snapshot "${newVersion.versionTag}" for workflow "${workflowName}".`,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = useCallback(
    (ver: WorkflowVersion) => {
      const now = Date.now();
      loadWorkflowFromData({
        id: workflowId,
        name: workflowName,
        nodes: ver.nodes as WorkflowNode[],
        edges: ver.edges as WorkflowEdge[],
        createdAt: ver.savedAt ?? now,
        updatedAt: now,
      });
      setRestoredId(ver.id);
      addLog({
        level: 'success',
        message: `Restored workflow "${workflowName}" to snapshot "${ver.versionTag}".`,
      });
      setTimeout(() => {
        setRestoredId(null);
        onClose();
      }, 800);
    },
    [workflowId, workflowName, loadWorkflowFromData, addLog, onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
      <div className="relative flex flex-col w-full max-w-2xl h-[75vh] rounded-xl border border-[#2a2a3e] bg-[#13131d] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e2e] bg-[#101018] px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                Workflow Version History
              </h2>
              <p className="text-[11px] text-gray-400">
                Snapshots & rollbacks for: <span className="text-gray-200">{workflowName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-[#1a1a2e] hover:text-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Create Snapshot Form */}
        <div className="border-b border-[#1e1e2e] bg-[#161622] p-4 shrink-0">
          <form onSubmit={handleCreateSnapshot} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-indigo-400" />
                Create New Version Snapshot
              </span>
              <span className="text-[10px] text-gray-500">
                Current Canvas: {nodes.length} nodes · {edges.length} connections
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tag (e.g. v1.1)"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                required
                className="w-28 rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-2.5 py-1.5 text-xs font-mono text-gray-100 focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Description of changes (e.g., Added validation and condition checks)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-2.5 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none"
              />
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isCreating || !versionTag.trim()}
                className="shrink-0"
              >
                Snapshot Current
              </Button>
            </div>
          </form>
        </div>

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a1a2e] border border-[#2a2a3e] text-gray-500 mb-3">
                <History className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-gray-300">No Version Snapshots Saved</p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                Take a snapshot above to preserve your current workflow design before making changes.
              </p>
            </div>
          ) : (
            versions.map((ver) => (
              <div
                key={ver.id}
                className="flex items-center justify-between rounded-lg border border-[#2a2a3e] bg-[#181826] p-3 hover:border-[#383854] transition-colors"
              >
                <div className="space-y-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                      {ver.versionTag}
                    </span>
                    <span className="text-xs font-medium text-gray-200 truncate">
                      {ver.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-gray-500" />
                      {new Date(ver.savedAt).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-gray-500" />
                      {ver.nodesCount} nodes
                    </span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3 text-gray-500" />
                      {ver.edgesCount} edges
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestore(ver)}
                    disabled={restoredId === ver.id}
                    className="flex items-center gap-1.5"
                  >
                    {restoredId === ver.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Restored!
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5 text-cyan-400" />
                        Restore
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
