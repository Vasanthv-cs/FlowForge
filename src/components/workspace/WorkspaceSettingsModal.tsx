import { useState } from 'react';
import {
  X,
  Settings,
  Users,
  Shield,
  Trash2,
  UserPlus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuthStore } from '@/store/authStore';
import type { WorkspaceRole } from '@flowforge/workflow-schema';

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkspaceSettingsModal({ isOpen, onClose }: WorkspaceSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');
  const [copiedId, setCopiedId] = useState(false);

  // General tab state
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const canManageMembers = useWorkspaceStore((s) => s.canManageMembers());
  const canDeleteWorkspace = useWorkspaceStore((s) => s.canDeleteWorkspace());

  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.name || '');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Delete workspace state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInputName, setDeleteInputName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Members tab state
  const members = useWorkspaceStore((s) => s.members);
  const isMembersLoading = useWorkspaceStore((s) => s.isMembersLoading);
  const addMember = useWorkspaceStore((s) => s.addMember);
  const updateRole = useWorkspaceStore((s) => s.updateRole);
  const removeMember = useWorkspaceStore((s) => s.removeMember);

  const currentUser = useAuthStore((s) => s.user);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('developer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  if (!isOpen || !activeWorkspace) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(activeWorkspace.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;

    setIsRenaming(true);
    setRenameError(null);
    setRenameSuccess(false);

    const res = await renameWorkspace(activeWorkspace.id, workspaceName.trim());
    setIsRenaming(false);

    if (res.success) {
      setRenameSuccess(true);
      setTimeout(() => setRenameSuccess(false), 2500);
    } else {
      setRenameError(res.error || 'Failed to rename workspace');
    }
  };

  const handleDelete = async () => {
    if (deleteInputName !== activeWorkspace.name) return;

    setIsDeleting(true);
    setDeleteError(null);

    const res = await deleteWorkspace(activeWorkspace.id);
    setIsDeleting(false);

    if (res.success) {
      onClose();
    } else {
      setDeleteError(res.error || 'Failed to delete workspace');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    const res = await addMember(activeWorkspace.id, inviteEmail.trim(), inviteRole);
    setIsInviting(false);

    if (res.success) {
      setInviteEmail('');
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 2500);
    } else {
      setInviteError(res.error || 'Failed to add member');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-[#2a2a3e] bg-[#141420] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#242438] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-100">{activeWorkspace.name} Settings</h3>
              <p className="text-xs text-gray-400">
                Manage workspace members, role permissions, and configurations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#202034] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#242438] px-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            General
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'members'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Members ({members.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'general' ? (
            <div className="space-y-6">
              {/* Workspace Details */}
              <div className="rounded-lg border border-[#242438] bg-[#171726] p-4 space-y-4">
                <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                  Workspace Information
                </h4>

                <form onSubmit={handleRename} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Workspace Name</label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        disabled={!canManageMembers}
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        className="bg-[#1a1a2c] border-[#2e2e46] text-xs"
                      />
                      {canManageMembers && (
                        <Button
                          type="submit"
                          size="sm"
                          disabled={isRenaming || workspaceName.trim() === activeWorkspace.name}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 text-xs"
                        >
                          {isRenaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Rename'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {renameSuccess && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Workspace renamed successfully
                    </p>
                  )}
                  {renameError && <p className="text-xs text-red-400">{renameError}</p>}
                </form>

                <div className="pt-2 border-t border-[#222234]">
                  <label className="block text-xs text-gray-400 mb-1">Workspace ID</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-gray-300 bg-[#12121e] px-2.5 py-1.5 rounded border border-[#26263a] flex-1 select-all">
                      {activeWorkspace.id}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyId}
                      className="border-[#2e2e46] shrink-0 text-xs gap-1"
                    >
                      {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-gray-400 flex items-center gap-2 pt-1">
                  <span>Your Role:</span>
                  <span className="capitalize font-medium text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded text-[11px]">
                    {activeWorkspace.role}
                  </span>
                </div>
              </div>

              {/* Danger Zone */}
              {canDeleteWorkspace && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Danger Zone</h4>
                  </div>
                  <p className="text-xs text-gray-400">
                    Permanently delete this workspace and all its workflows, versions, and execution records.
                    This action cannot be undone.
                  </p>

                  {!showDeleteConfirm ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-xs"
                    >
                      Delete Workspace
                    </Button>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs text-red-300 font-medium">
                        Type <strong>{activeWorkspace.name}</strong> to confirm:
                      </p>
                      <Input
                        type="text"
                        placeholder={activeWorkspace.name}
                        value={deleteInputName}
                        onChange={(e) => setDeleteInputName(e.target.value)}
                        className="bg-[#1a1a2c] border-red-500/30 text-xs"
                      />
                      {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteInputName('');
                          }}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deleteInputName !== activeWorkspace.name || isDeleting}
                          onClick={handleDelete}
                          className="text-xs flex items-center gap-1.5"
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Confirm Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Invite Member Section */}
              {canManageMembers ? (
                <div className="rounded-lg border border-[#242438] bg-[#171726] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5 text-indigo-400" />
                    Invite Workspace Member
                  </h4>
                  <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      required
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="bg-[#1a1a2c] border-[#2e2e46] text-xs flex-1"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                      className="bg-[#1a1a2c] border border-[#2e2e46] text-gray-200 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="developer">Developer</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button
                      type="submit"
                      disabled={isInviting || !inviteEmail.trim()}
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 text-xs flex items-center gap-1.5"
                    >
                      {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Add Member
                    </Button>
                  </form>

                  {inviteSuccess && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Member added to workspace!
                    </p>
                  )}
                  {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
                </div>
              ) : (
                <div className="rounded-lg border border-[#242438] bg-[#171726]/50 p-3 text-xs text-gray-400 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-500" />
                  Only workspace owners and admins can invite or manage members.
                </div>
              )}

              {/* Members List */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                  Active Members
                </h4>

                {isMembersLoading ? (
                  <div className="py-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading members...
                  </div>
                ) : (
                  <div className="rounded-lg border border-[#242438] divide-y divide-[#242438] bg-[#171726]">
                    {members.map((member) => {
                      const isSelf = member.userId === currentUser?.id;
                      const isMemberOwner = member.role === 'owner';

                      return (
                        <div key={member.userId} className="flex items-center justify-between p-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
                              {member.displayName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-200">
                                  {member.displayName}
                                </span>
                                {isSelf && (
                                  <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.2 rounded">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">{member.email}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Role selector or badge */}
                            {canManageMembers && !isMemberOwner ? (
                              <select
                                value={member.role}
                                onChange={(e) =>
                                  updateRole(
                                    activeWorkspace.id,
                                    member.userId,
                                    e.target.value as WorkspaceRole
                                  )
                                }
                                className="bg-[#12121e] border border-[#2e2e46] text-gray-200 text-xs rounded px-2 py-1 focus:outline-none"
                              >
                                <option value="admin">Admin</option>
                                <option value="developer">Developer</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            ) : (
                              <span
                                className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${
                                  member.role === 'owner'
                                    ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40'
                                    : member.role === 'admin'
                                    ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                                    : member.role === 'developer'
                                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                    : 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                                }`}
                              >
                                {member.role}
                              </span>
                            )}

                            {/* Remove button */}
                            {((canManageMembers && !isMemberOwner) || (isSelf && !isMemberOwner)) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeMember(activeWorkspace.id, member.userId)}
                                className="h-7 w-7 p-0 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                                title={isSelf ? 'Leave workspace' : 'Remove member'}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
