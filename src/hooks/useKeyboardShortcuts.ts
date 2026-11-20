import { useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';

export function useKeyboardShortcuts() {
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const canUndo = useWorkflowStore((s) => s.canUndo);
  const canRedo = useWorkflowStore((s) => s.canRedo);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const deleteSelected = useWorkflowStore((s) => s.deleteSelected);
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode);
  const copyNode = useWorkflowStore((s) => s.copyNode);
  const pasteNode = useWorkflowStore((s) => s.pasteNode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when user is typing inside form elements
      const target = e.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // 1. Save (Ctrl/Cmd + S)
      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveWorkflow();
        return;
      }

      // 2. Undo (Ctrl/Cmd + Z)
      if (modifier && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (!isInputField && canUndo()) {
          e.preventDefault();
          undo();
        }
        return;
      }

      // 3. Redo (Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y)
      if (
        (modifier && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (modifier && e.key.toLowerCase() === 'y')
      ) {
        if (!isInputField && canRedo()) {
          e.preventDefault();
          redo();
        }
        return;
      }

      // 4. Duplicate (Ctrl/Cmd + D)
      if (modifier && e.key.toLowerCase() === 'd') {
        if (selectedNodeId && !isInputField) {
          e.preventDefault();
          duplicateNode(selectedNodeId);
        }
        return;
      }

      // 5. Copy (Ctrl/Cmd + C)
      if (modifier && e.key.toLowerCase() === 'c' && !isInputField) {
        if (selectedNodeId) {
          e.preventDefault();
          copyNode(selectedNodeId);
        }
        return;
      }

      // 6. Paste (Ctrl/Cmd + V)
      if (modifier && e.key.toLowerCase() === 'v' && !isInputField) {
        e.preventDefault();
        pasteNode();
        return;
      }

      // 7. Delete / Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputField) {
        deleteSelected();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    saveWorkflow,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedNodeId,
    deleteSelected,
    duplicateNode,
    copyNode,
    pasteNode,
  ]);
}
