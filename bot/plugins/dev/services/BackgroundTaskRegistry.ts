/**
 * Background Task Registry — Tracks all repeating/interval-based tasks
 * across the bot so the dev panel can display their state.
 *
 * Services can register themselves via the singleton `taskRegistry`.
 * The dev Tasks panel reads from this registry to show task status.
 */

export interface BackgroundTask {
  /** Unique identifier, e.g. "activity-rotation" */
  id: string;
  /** Which plugin owns this task */
  plugin: string;
  /** Human-readable label */
  label: string;
  /** Interval in milliseconds (0 for one-shot or manual) */
  intervalMs: number;
  /** Whether the task is currently running */
  isRunning: boolean;
  /** When the task was registered */
  registeredAt: Date;
  /** Optional description */
  description?: string;
}

class BackgroundTaskRegistry {
  private tasks = new Map<string, BackgroundTask>();

  /**
   * Register a background task. If a task with the same ID already exists,
   * it will be updated.
   */
  register(task: Omit<BackgroundTask, "registeredAt">): void {
    const existing = this.tasks.get(task.id);
    this.tasks.set(task.id, {
      ...task,
      registeredAt: existing?.registeredAt ?? new Date(),
    });
  }

  /** Unregister a task by ID. */
  unregister(id: string): boolean {
    return this.tasks.delete(id);
  }

  /** Update the running state of a task. */
  setRunning(id: string, isRunning: boolean): void {
    const task = this.tasks.get(id);
    if (task) task.isRunning = isRunning;
  }

  /** Get a single task by ID. */
  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  /** Get all registered tasks, sorted by plugin then label. */
  getAll(): BackgroundTask[] {
    return [...this.tasks.values()].sort((a, b) => a.plugin.localeCompare(b.plugin) || a.label.localeCompare(b.label));
  }

  /** Get count of registered tasks. */
  get size(): number {
    return this.tasks.size;
  }
}

/** Singleton task registry instance. */
export const taskRegistry = new BackgroundTaskRegistry();
