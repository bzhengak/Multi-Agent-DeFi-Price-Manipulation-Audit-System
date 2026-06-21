type TaskStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

interface TaskState {
  status: TaskStatus;
  progress: number;
  stage: string;
  details?: string;
  error?: string;
  contractName?: string;
  contractAddress?: string;
  chain?: string;
  classification?: string;
  confidence?: number;
  attackChains?: number;
  reportId?: string;
  updatedAt?: string;
}

type TaskSubscriber = (state: TaskState) => void;

class TaskStateManager {
  private tasks: Map<string, TaskState> = new Map();
  private subscribers: Map<string, Set<TaskSubscriber>> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupStale(), 60_000);
  }

  set(taskId: string, state: Record<string, unknown>): TaskState {
    const existing = this.tasks.get(taskId) || { status: 'pending' as TaskStatus, progress: 0, stage: '' };
    const merged = { ...existing, ...state, updatedAt: new Date().toISOString() } as unknown as TaskState;
    this.tasks.set(taskId, merged);
    this.notify(taskId, merged);
    return merged;
  }

  get(taskId: string): TaskState | null {
    return this.tasks.get(taskId) || null;
  }

  subscribe(taskId: string, callback: TaskSubscriber): () => void {
    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Set());
    }
    this.subscribers.get(taskId)!.add(callback);
    return () => {
      this.subscribers.get(taskId)?.delete(callback);
    };
  }

  delete(taskId: string): void {
    this.tasks.delete(taskId);
    this.subscribers.delete(taskId);
  }

  private notify(taskId: string, state: TaskState): void {
    this.subscribers.get(taskId)?.forEach((cb) => {
      try { cb(state); } catch { /* subscriber error ignored */ }
    });
  }

  private cleanupStale(): void {
    const cutoff = Date.now() - 30 * 60_000;
    const stale: string[] = [];
    for (const [taskId, state] of this.tasks) {
      const updated = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
      if (updated < cutoff) stale.push(taskId);
    }
    for (const id of stale) this.delete(id);
  }
}

export const taskStates = new TaskStateManager();
