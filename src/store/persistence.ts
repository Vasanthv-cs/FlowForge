import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';

export interface SavedWorkflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'flowforge_workflows';
const CURRENT_WF_KEY = 'flowforge_current_id';

/**
 * LocalStorage / IndexedDB repository for saving and loading workflows.
 */
export class WorkflowPersistence {
  /**
   * Save a workflow into local persistent storage.
   */
  public static async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    try {
      const workflows = this.listWorkflows();
      const existingIdx = workflows.findIndex((w) => w.id === workflow.id);
      if (existingIdx >= 0) {
        workflows[existingIdx] = workflow;
      } else {
        workflows.push(workflow);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
      localStorage.setItem(CURRENT_WF_KEY, workflow.id);
    } catch (err) {
      console.error('Failed to save workflow to persistence:', err);
      throw err;
    }
  }

  /**
   * Loads a workflow by ID.
   */
  public static getWorkflow(id: string): SavedWorkflow | null {
    const list = this.listWorkflows();
    return list.find((w) => w.id === id) ?? null;
  }

  /**
   * Lists all saved workflows.
   */
  public static listWorkflows(): SavedWorkflow[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SavedWorkflow[];
    } catch {
      return [];
    }
  }

  /**
   * Deletes a saved workflow.
   */
  public static deleteWorkflow(id: string): void {
    const list = this.listWorkflows().filter((w) => w.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * Gets the last active workflow ID.
   */
  public static getLastActiveId(): string | null {
    return localStorage.getItem(CURRENT_WF_KEY);
  }
}
