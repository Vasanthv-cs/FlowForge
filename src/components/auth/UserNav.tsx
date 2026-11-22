import { useState, useRef, useEffect } from 'react';
import { LogIn, LogOut, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { AuthModal } from './AuthModal';

export function UserNav() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (user) {
      loadWorkspaces();
    }
  }, [user, loadWorkspaces]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAuthModal(true)}
          className="text-xs border-[#2e2e46] bg-[#161626] hover:bg-[#202034] text-indigo-300 flex items-center gap-1.5"
        >
          <LogIn className="h-3.5 w-3.5 text-indigo-400" />
          Sign In
        </Button>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </>
    );
  }

  const displayName = profile?.displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg border border-[#2a2a3e] bg-[#141422] hover:bg-[#1a1a2e] text-xs transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
          {initials}
        </div>
        <span className="font-medium text-gray-200 max-w-[100px] truncate">{displayName}</span>
        <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-[#2e2e46] bg-[#141422] p-2 shadow-2xl z-50 animate-fade-in">
          <div className="px-2.5 py-2 border-b border-[#242438] mb-1">
            <p className="text-xs font-semibold text-gray-100 truncate">{displayName}</p>
            <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
            {activeWorkspace && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Active Role:</span>
                <span className="text-[10px] font-medium text-indigo-400 capitalize">
                  {activeWorkspace.role}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={async () => {
              setIsDropdownOpen(false);
              await signOut();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
