import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  BookTemplate,
  Plus,
  Globe,
  Calendar,
  Layers,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Workflow,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import {
  templateClientService,
} from '@/services/templateClientService';
import {
  instantiateWorkflowFromTemplate,
  type WorkflowTemplate,
  type WorkflowTemplateCategory,
} from '@flowforge/workflow-schema';
import { cn } from '@/lib/utils';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Templates' },
  { id: 'data', label: 'Data Processing' },
  { id: 'integration', label: 'Integrations & APIs' },
  { id: 'automation', label: 'Scheduled Automation' },
  { id: 'error-handling', label: 'Error Handling' },
  { id: 'general', label: 'General' },
];

export function TemplatesModal({ isOpen, onClose }: TemplatesModalProps) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const loadWorkflowFromData = useWorkflowStore((s) => s.loadWorkflowFromData);
  const addLog = useWorkflowStore((s) => s.addLog);
  const storeWorkspaceId = useWorkflowStore((s) => s.workspaceId);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceId = storeWorkspaceId || activeWorkspaceId;
  const canCreate = useWorkspaceStore((s) => s.canCreateWorkflows());

  const [activeTab, setActiveTab] = useState<'browse' | 'saveCurrent'>('browse');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Save current workflow as template state
  const [saveName, setSaveName] = useState(workflowName || 'My Reusable Template');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveCategory, setSaveCategory] = useState<WorkflowTemplateCategory>('general');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load templates when modal opens or category/search changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setIsLoading(true);
    });

    templateClientService
      .listTemplates(workspaceId, {
        category: selectedCategory,
        search: searchQuery,
      })
      .then(({ data }) => {
        if (!isMounted) return;
        setTemplates(data || []);
        if (data && data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(data[0].id);
        }
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, workspaceId, selectedCategory, searchQuery, selectedTemplateId]);

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0] || null;
  }, [templates, selectedTemplateId]);

  if (!isOpen) return null;

  const handleUseTemplate = (tpl: WorkflowTemplate) => {
    const instantiated = instantiateWorkflowFromTemplate(tpl);
    loadWorkflowFromData(instantiated as any);
    addLog({
      level: 'info',
      message: `Created new workflow "${instantiated.name}" from template "${tpl.name}" (${instantiated.nodes.length} nodes).`,
    });
    onClose();
  };

  const handleSaveCurrentAsTemplate = async () => {
    if (!workspaceId) {
      setSaveError('You must be in a workspace to save private workspace templates.');
      return;
    }
    if (!saveName.trim()) {
      setSaveError('Template name is required.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const definition = {
      id: `wf-tpl-${Date.now()}`,
      name: saveName.trim(),
      nodes,
      edges,
    };

    const { data, error } = await templateClientService.saveAsWorkspaceTemplate(
      workspaceId,
      {
        name: saveName.trim(),
        description: saveDesc.trim(),
        category: saveCategory,
        definition,
      }
    );

    setIsSaving(false);

    if (error || !data) {
      setSaveError(error || 'Failed to save template.');
      return;
    }

    setSaveSuccess(true);
    addLog({
      level: 'success',
      message: `Saved private workspace template "${data.name}".`,
    });

    // Refresh list and select
    setTemplates((prev) => [data, ...prev]);
    setSelectedTemplateId(data.id);
    setTimeout(() => {
      setSaveSuccess(false);
      setActiveTab('browse');
    }, 1200);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!workspaceId) return;
    const { success } = await templateClientService.deleteWorkspaceTemplate(workspaceId, templateId);
    if (success) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
      addLog({ level: 'info', message: 'Workspace template deleted.' });
    }
  };

  const getTemplateIcon = (cat: string) => {
    switch (cat) {
      case 'data':
        return <Layers className="h-4 w-4 text-blue-400" />;
      case 'integration':
        return <Globe className="h-4 w-4 text-cyan-400" />;
      case 'automation':
        return <Calendar className="h-4 w-4 text-purple-400" />;
      case 'error-handling':
        return <ShieldAlert className="h-4 w-4 text-red-400" />;
      default:
        return <Workflow className="h-4 w-4 text-indigo-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl h-[650px] rounded-xl border border-[#2a2a3e] bg-[#12121d] shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#232338] bg-[#0e0e17] px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <BookTemplate className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100 text-sm flex items-center gap-2">
                Workflow Templates
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-normal">
                  Starter & Workspace
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                Jumpstart automation pipelines with pre-built, production-ready workflow patterns.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="flex bg-[#191929] rounded-lg p-0.5 border border-[#292942]">
              <button
                type="button"
                onClick={() => setActiveTab('browse')}
                className={cn(
                  'px-3 py-1 rounded text-[11px] font-medium transition-colors',
                  activeTab === 'browse'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                )}
              >
                Browse Templates
              </button>
              {Boolean(canCreate && workspaceId) && (
                <button
                  type="button"
                  onClick={() => setActiveTab('saveCurrent')}
                  className={cn(
                    'px-3 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
                    activeTab === 'saveCurrent'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  )}
                >
                  <Plus className="h-3 w-3" /> Save Current as Template
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Browse Templates */}
        {activeTab === 'browse' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel: Search, Categories & Template List */}
            <div className="w-1/2 border-r border-[#222234] flex flex-col">
              {/* Search & Filter Bar */}
              <div className="p-3 border-b border-[#202030] bg-[#141422] space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-500" />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-[11px] bg-[#0d0d15] border-[#26263c]"
                  />
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                        selectedCategory === cat.id
                          ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50'
                          : 'bg-[#181826] text-gray-400 hover:text-gray-200 border border-transparent'
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Items List */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#1e1e2e]">
                {isLoading ? (
                  <div className="p-8 text-center text-gray-500">Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No matching templates found.</div>
                ) : (
                  templates.map((tpl) => {
                    const isSelected = selectedTemplate?.id === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setSelectedTemplateId(tpl.id)}
                        className={cn(
                          'p-3 cursor-pointer transition-colors space-y-1',
                          isSelected
                            ? 'bg-[#1e1e32] border-l-2 border-indigo-500'
                            : 'hover:bg-[#161626]'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getTemplateIcon(tpl.category)}
                            <span className="font-semibold text-gray-100">{tpl.name}</span>
                          </div>
                          <span
                            className={cn(
                              'text-[9px] uppercase px-1.5 py-0.2 rounded font-mono',
                              tpl.isWorkspaceTemplate
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            )}
                          >
                            {tpl.isWorkspaceTemplate ? 'Workspace' : 'Starter'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 line-clamp-2">
                          {tpl.description}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono pt-0.5">
                          <span>{tpl.definition.nodes.length} nodes</span>
                          <span>•</span>
                          <span>{tpl.definition.edges.length} edges</span>
                          <span>•</span>
                          <span className="capitalize">{tpl.category}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Panel: Template Preview & Action */}
            <div className="w-1/2 flex flex-col bg-[#10101a]">
              {selectedTemplate ? (
                <>
                  <div className="p-5 flex-1 overflow-y-auto space-y-4">
                    {/* Title & Badge */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                          {selectedTemplate.category}
                        </span>
                        {selectedTemplate.isWorkspaceTemplate && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(selectedTemplate.id)}
                            className="text-gray-500 hover:text-red-400 p-1"
                            title="Delete workspace template"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-gray-100">
                        {selectedTemplate.name}
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {selectedTemplate.description}
                      </p>
                    </div>

                    {/* Node Structure Preview */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase text-gray-400 block">
                        Included Workflow Nodes ({selectedTemplate.definition.nodes.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTemplate.definition.nodes.map((n) => (
                          <span
                            key={n.id}
                            className="px-2 py-1 rounded bg-[#181828] border border-[#26263c] text-[11px] text-gray-200 flex items-center gap-1 font-mono"
                          >
                            <span className="text-indigo-400">{n.data?.type}</span>
                            <span className="text-gray-500">|</span>
                            <span>{n.data?.label || n.id}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Required Configurations */}
                    {selectedTemplate.requiredConfig.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase text-gray-400 block">
                          Required Configurations:
                        </span>
                        <ul className="space-y-1">
                          {selectedTemplate.requiredConfig.map((item, idx) => (
                            <li
                              key={idx}
                              className="text-[11px] text-gray-300 flex items-center gap-1.5"
                            >
                              <div className="h-1 w-1 rounded-full bg-indigo-400" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Environment Variables */}
                    {selectedTemplate.requiredEnvVars.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase text-gray-400 block">
                          Environment Variables:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {selectedTemplate.requiredEnvVars.map((v) => (
                            <span
                              key={v}
                              className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 border-t border-[#222234] bg-[#0d0d15] flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">
                      Instantiates a fresh editable copy on your canvas.
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleUseTemplate(selectedTemplate)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Use This Template
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  Select a template to view details
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Save Current Workflow as Template */}
        {activeTab === 'saveCurrent' && (
          <div className="p-6 space-y-4 max-w-xl mx-auto flex-1 overflow-y-auto">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-100">
                Save Current Canvas Workflow as a Workspace Template
              </h4>
              <p className="text-xs text-gray-400">
                Make your custom workflow reusable across all members in this workspace. Secrets and live tokens will be safely redacted.
              </p>
            </div>

            {saveError && (
              <div className="p-2.5 rounded bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{saveError}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>Template saved successfully!</span>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                  Template Name:
                </label>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Production Payment Webhook Flow"
                  className="bg-[#141422] border-[#292940] text-xs h-8"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                  Category:
                </label>
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value as WorkflowTemplateCategory)}
                  className="w-full h-8 rounded border border-[#292940] bg-[#141422] px-2 text-xs text-gray-200 focus:outline-none"
                >
                  <option value="general">General</option>
                  <option value="data">Data Processing</option>
                  <option value="integration">Integrations & APIs</option>
                  <option value="automation">Scheduled Automation</option>
                  <option value="error-handling">Error Handling</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                  Description:
                </label>
                <textarea
                  rows={3}
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="Explain what this template does, required inputs, and expected outcomes..."
                  className="w-full rounded border border-[#292940] bg-[#141422] p-2 text-xs text-gray-200 focus:outline-none resize-none"
                />
              </div>

              <div className="p-3 rounded border border-[#26263e] bg-[#0f0f18] text-[11px] text-gray-400 space-y-1 font-mono">
                <div>Snapshot nodes: {nodes.length}</div>
                <div>Snapshot edges: {edges.length}</div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('browse')}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCurrentAsTemplate}
                  disabled={isSaving}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  {isSaving ? 'Saving Template...' : 'Save Workspace Template'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
