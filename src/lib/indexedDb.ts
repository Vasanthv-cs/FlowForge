import type { SavedWorkflow } from '@/store/persistence';
import type { WorkflowVersion, TestScenario } from '@/types/testLab';

const DB_NAME = 'FlowForge_DB';
const DB_VERSION = 1;

const STORE_WORKFLOWS = 'workflows';
const STORE_VERSIONS = 'workflow_versions';
const STORE_TEST_SCENARIOS = 'test_scenarios';

/**
 * Native Promise-based IndexedDB storage engine with dual-write fallback.
 */
class IndexedDbStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private isIdbAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  private getDB(): Promise<IDBDatabase> {
    if (!this.isIdbAvailable()) {
      return Promise.reject(new Error('IndexedDB not supported in current environment'));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_WORKFLOWS)) {
            db.createObjectStore(STORE_WORKFLOWS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
            const versionStore = db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' });
            versionStore.createIndex('workflowId', 'workflowId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_TEST_SCENARIOS)) {
            const scenarioStore = db.createObjectStore(STORE_TEST_SCENARIOS, { keyPath: 'id' });
            scenarioStore.createIndex('workflowId', 'workflowId', { unique: false });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    return this.dbPromise;
  }

  /* ── 1. Workflows Repository ─────────────────────── */
  public async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    // 1. Dual-write to localStorage for instant sync & fallback
    try {
      const list = this.listWorkflowsSync();
      const idx = list.findIndex((w) => w.id === workflow.id);
      if (idx >= 0) list[idx] = workflow;
      else list.push(workflow);
      localStorage.setItem('flowforge_workflows', JSON.stringify(list));
    } catch {
      // localStorage quota
    }

    // 2. Persist to IndexedDB
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_WORKFLOWS, 'readwrite');
        const store = tx.objectStore(STORE_WORKFLOWS);
        store.put(workflow);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Fallback handled
    }
  }

  public async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    try {
      const db = await this.getDB();
      return await new Promise<SavedWorkflow | null>((resolve) => {
        const tx = db.transaction(STORE_WORKFLOWS, 'readonly');
        const store = tx.objectStore(STORE_WORKFLOWS);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      // Fallback to localStorage
      const list = this.listWorkflowsSync();
      return list.find((w) => w.id === id) ?? null;
    }
  }

  public async listWorkflows(): Promise<SavedWorkflow[]> {
    try {
      const db = await this.getDB();
      const items = await new Promise<SavedWorkflow[]>((resolve, reject) => {
        const tx = db.transaction(STORE_WORKFLOWS, 'readonly');
        const store = tx.objectStore(STORE_WORKFLOWS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      });
      if (items.length > 0) return items;
      return this.listWorkflowsSync();
    } catch {
      return this.listWorkflowsSync();
    }
  }

  public async deleteWorkflow(id: string): Promise<void> {
    // Sync localStorage
    const list = this.listWorkflowsSync().filter((w) => w.id !== id);
    localStorage.setItem('flowforge_workflows', JSON.stringify(list));

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_WORKFLOWS, 'readwrite');
        tx.objectStore(STORE_WORKFLOWS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Handled
    }
  }

  private listWorkflowsSync(): SavedWorkflow[] {
    try {
      const raw = localStorage.getItem('flowforge_workflows');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /* ── 2. Workflow Versioning ──────────────────────── */
  public async saveVersion(version: WorkflowVersion): Promise<void> {
    try {
      const list = this.listVersionsSync(version.workflowId);
      list.unshift(version);
      localStorage.setItem(`ff_versions_${version.workflowId}`, JSON.stringify(list.slice(0, 20)));
    } catch {
      // ignore localStorage quota errors
    }

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_VERSIONS, 'readwrite');
        tx.objectStore(STORE_VERSIONS).put(version);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // ignore IndexedDB write errors
    }
  }

  public async listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    try {
      const db = await this.getDB();
      const versions = await new Promise<WorkflowVersion[]>((resolve) => {
        const tx = db.transaction(STORE_VERSIONS, 'readonly');
        const store = tx.objectStore(STORE_VERSIONS);
        const index = store.index('workflowId');
        const req = index.getAll(workflowId);
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => resolve([]);
      });
      if (versions.length > 0) return versions.sort((a, b) => b.savedAt - a.savedAt);
      return this.listVersionsSync(workflowId);
    } catch {
      return this.listVersionsSync(workflowId);
    }
  }

  private listVersionsSync(workflowId: string): WorkflowVersion[] {
    try {
      const raw = localStorage.getItem(`ff_versions_${workflowId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /* ── 3. Test Scenarios ───────────────────────────── */
  public async saveTestScenario(scenario: TestScenario): Promise<void> {
    try {
      const list = this.listTestScenariosSync(scenario.workflowId);
      const idx = list.findIndex((s) => s.id === scenario.id);
      if (idx >= 0) list[idx] = scenario;
      else list.push(scenario);
      localStorage.setItem(`ff_scenarios_${scenario.workflowId}`, JSON.stringify(list));
    } catch {
      // ignore localStorage quota errors
    }

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_TEST_SCENARIOS, 'readwrite');
        tx.objectStore(STORE_TEST_SCENARIOS).put(scenario);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // ignore IndexedDB write errors
    }
  }

  public async listTestScenarios(workflowId: string): Promise<TestScenario[]> {
    try {
      const db = await this.getDB();
      const scenarios = await new Promise<TestScenario[]>((resolve) => {
        const tx = db.transaction(STORE_TEST_SCENARIOS, 'readonly');
        const store = tx.objectStore(STORE_TEST_SCENARIOS);
        const index = store.index('workflowId');
        const req = index.getAll(workflowId);
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => resolve([]);
      });
      if (scenarios.length > 0) return scenarios;
      return this.listTestScenariosSync(workflowId);
    } catch {
      return this.listTestScenariosSync(workflowId);
    }
  }

  public async deleteTestScenario(workflowId: string, scenarioId: string): Promise<void> {
    const list = this.listTestScenariosSync(workflowId).filter((s) => s.id !== scenarioId);
    localStorage.setItem(`ff_scenarios_${workflowId}`, JSON.stringify(list));

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_TEST_SCENARIOS, 'readwrite');
        tx.objectStore(STORE_TEST_SCENARIOS).delete(scenarioId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore IndexedDB delete errors
    }
  }

  public async duplicateTestScenario(workflowId: string, scenarioId: string): Promise<TestScenario | null> {
    const scenarios = await this.listTestScenarios(workflowId);
    const target = scenarios.find((s) => s.id === scenarioId);
    if (!target) return null;

    const duplicated: TestScenario = {
      ...JSON.parse(JSON.stringify(target)),
      id: `sc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${target.name} (Copy)`,
      lastRunAt: undefined,
      lastRunPassed: undefined,
      lastRunDurationMs: undefined,
      lastRunResults: undefined,
    };
    await this.saveTestScenario(duplicated);
    return duplicated;
  }

  private listTestScenariosSync(workflowId: string): TestScenario[] {
    try {
      const raw = localStorage.getItem(`ff_scenarios_${workflowId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export const idbStorage = new IndexedDbStorage();
