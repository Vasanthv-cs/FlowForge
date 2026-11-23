import { ReactFlowProvider } from '@xyflow/react';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { TopNav } from '@/components/layout/TopNav';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { BottomPanel } from '@/components/layout/BottomPanel';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { useWorkflowStore } from '@/store/workflowStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

function WorkflowStudio() {
  // Activate global keyboard shortcuts
  useKeyboardShortcuts();

  // Initialize auth once on mount: restores existing sessions AND handles
  // OAuth redirect callbacks (access_token hash fragments from Google sign-in).
  const initialize = useAuthStore((s) => s.initialize);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [initialize, isInitialized]);

  const leftSidebarOpen = useWorkflowStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useWorkflowStore((s) => s.rightSidebarOpen);
  const bottomPanelOpen = useWorkflowStore((s) => s.bottomPanelOpen);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f0f17]">
      {/* Top navigation */}
      <TopNav />

      {/* Main Studio Work Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Node Library */}
        {leftSidebarOpen && <LeftSidebar />}

        {/* Center area: Canvas + Bottom Output Panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Canvas */}
          <FlowCanvas />

          {/* Bottom Panel */}
          {bottomPanelOpen && <BottomPanel />}
        </div>

        {/* Right sidebar - Node Inspector */}
        {rightSidebarOpen && <RightSidebar />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <ReactFlowProvider>
        <WorkflowStudio />
      </ReactFlowProvider>
    </TooltipProvider>
  );
}
