import { useState, useRef, useEffect } from 'react';
import {
  Briefcase,
  ChevronDown,
  Check,
  Plus,
  Settings,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { cloudWorkflowService } from '@/services/cloudWorkflowService';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';

export function WorkspaceSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectWorkspace = async (newWsId: string) => {
    if (newWsId === activeWorkspace?.id) {
      setIsOpen(false);
      return;
    }

    const currentWorkflow = useWorkflowStore.getState();
    if (
      currentWorkflow.isCloudWorkflow &&
      currentWorkflow.workspaceId &&
      currentWorkflow.workspaceId !== newWsId
    ) {
      if (!currentWorkflow.isSaved || currentWorkflow.saveStatus === 'unsaved') {
        const confirmSwitch = window.confirm(
          'You have unsaved changes in the current workflow. Discard and switch workspace?'
        );
        if (!confirmSwitch) return;
      }

      setActiveWorkspace(newWsId);
      setIsOpen(false);

      // Check if the target workspace has workflows, otherwise initialize blank for it
      const { data } = await cloudWorkflowService.listWorkflows(newWsId);
      if (data && data.length > 0) {
        await currentWorkflow.loadCloudWorkflow(data[0].id);
      } else {
        currentWorkflow.createNewWorkflow('New Workflow', {
          isCloud: true,
          workspaceId: newWsId,
        });
      }
      return;
    }

    setActiveWorkspace(newWsId);
    setIsOpen(false);
  };

  const getRoleBadgeClass = (role?: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-950/60 text-purple-300 border-purple-800/40';
      case 'admin':
        return 'bg-sky-950/60 text-sky-300 border-sky-800/40';
      case 'developer':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40';
      case 'viewer':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/40';
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#2a2a3e] bg-[#141422] hover:bg-[#1a1a2e] text-xs text-gray-200 transition-colors"
      >
        <Briefcase className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        <span className="font-medium max-w-[130px] truncate">
          {activeWorkspace?.name || 'Default Workspace'}
        </span>
        {activeWorkspace?.role && (
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded border font-medium capitalize ${getRoleBadgeClass(
              activeWorkspace.role
            )}`}
          >
            {activeWorkspace.role}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-gray-400 shrink-0 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-60 rounded-xl border border-[#2e2e46] bg-[#141422] p-1.5 shadow-2xl z-50 animate-fade-in">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-[#242438] mb-1">
            Workspaces ({workspaces.length})
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {workspaces.map((ws) => {
              const isSelected = ws.id === activeWorkspace?.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => handleSelectWorkspace(ws.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                    isSelected
                      ? 'bg-indigo-600/15 text-indigo-200 font-medium'
                      : 'text-gray-300 hover:bg-[#1f1f34] hover:text-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{ws.name}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded border font-medium capitalize ${getRoleBadgeClass(
                        ws.role
                      )}`}
                    >
                      {ws.role}
                    </span>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="pt-1.5 mt-1 border-t border-[#242438] space-y-0.5">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowCreateModal(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-gray-300 hover:text-gray-100 hover:bg-[#1f1f34] transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-indigo-400" />
              <span>Create Workspace</span>
            </button>

            {activeWorkspace && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowSettingsModal(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-gray-300 hover:text-gray-100 hover:bg-[#1f1f34] transition-colors"
              >
                <Settings className="h-3.5 w-3.5 text-gray-400" />
                <span>Workspace Settings</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateWorkspaceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <WorkspaceSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
}
