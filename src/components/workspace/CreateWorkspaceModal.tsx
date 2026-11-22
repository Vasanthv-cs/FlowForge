import { useState } from 'react';
import { X, Briefcase, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateWorkspaceModal({ isOpen, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await createWorkspace(name.trim());
    setSubmitting(false);

    if (res.success) {
      setName('');
      onClose();
    } else {
      setError(res.error || 'Failed to create workspace');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-xl border border-[#2a2a3e] bg-[#141420] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#202034] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-100">Create New Workspace</h3>
            <p className="text-xs text-gray-400">Workspaces group team members, workflows, and executions</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">Workspace Name</label>
            <Input
              type="text"
              required
              placeholder="e.g. Growth & Marketing Pipelines"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#1a1a2c] border-[#2e2e46]"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create Workspace
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
