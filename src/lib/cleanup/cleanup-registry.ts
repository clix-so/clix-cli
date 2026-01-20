import { coreEvents } from '../events/core-events';

/**
 * Async cleanup function type.
 */
export type CleanupFn = () => void | Promise<void>;

/**
 * Sync cleanup function type.
 */
export type SyncCleanupFn = () => void;

/**
 * Cleanup entry with metadata.
 */
interface CleanupEntry {
  id: string;
  fn: CleanupFn;
  type: 'sync' | 'async';
  priority: number;
}

/**
 * Registry for managing cleanup functions.
 * Handles process exit, signals (SIGINT, SIGTERM), and uncaught exceptions.
 *
 * @example
 * ```typescript
 * // Register an async cleanup
 * const id = registerCleanup(async () => {
 *   await database.close();
 * }, 100); // Higher priority runs first
 *
 * // Register a sync cleanup
 * registerSyncCleanup(() => {
 *   console.log('Goodbye!');
 * }, 0);
 *
 * // Unregister when no longer needed
 * unregisterCleanup(id);
 * ```
 */
class CleanupRegistry {
  private cleanups: Map<string, CleanupEntry> = new Map();
  private isCleaningUp = false;
  private cleanupIdCounter = 0;
  private hasRegisteredHandlers = false;

  constructor() {
    this.registerProcessHandlers();
  }

  /**
   * Register process exit handlers.
   * Only registers once, even if called multiple times.
   */
  private registerProcessHandlers(): void {
    if (this.hasRegisteredHandlers) return;
    this.hasRegisteredHandlers = true;

    // Handle normal exit
    process.on('exit', () => {
      this.runSyncCleanups();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.runAllCleanups().then(() => {
        process.exit(130); // 128 + signal number (2 for SIGINT)
      });
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.runAllCleanups().then(() => {
        process.exit(143); // 128 + signal number (15 for SIGTERM)
      });
    });

    // Handle uncaught exceptions - log but still cleanup
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.runAllCleanups()
        .catch(() => {
          // Ignore cleanup errors during exception handling
        })
        .finally(() => {
          process.exit(1);
        });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      // Don't exit on unhandled rejection, just log it
    });
  }

  /**
   * Register an async cleanup function.
   *
   * @param fn - Cleanup function (can be async)
   * @param priority - Higher priority runs first (default: 0)
   * @returns Unique ID for unregistering
   */
  registerCleanup(fn: CleanupFn, priority = 0): string {
    const id = `cleanup-${++this.cleanupIdCounter}`;
    this.cleanups.set(id, { id, fn, type: 'async', priority });
    coreEvents.emit('cleanup:registered', { id, type: 'async', priority });
    return id;
  }

  /**
   * Register a sync cleanup function.
   * Sync cleanups are guaranteed to run even on synchronous exit.
   *
   * @param fn - Sync cleanup function
   * @param priority - Higher priority runs first (default: 0)
   * @returns Unique ID for unregistering
   */
  registerSyncCleanup(fn: SyncCleanupFn, priority = 0): string {
    const id = `cleanup-${++this.cleanupIdCounter}`;
    this.cleanups.set(id, { id, fn, type: 'sync', priority });
    coreEvents.emit('cleanup:registered', { id, type: 'sync', priority });
    return id;
  }

  /**
   * Unregister a cleanup function by ID.
   *
   * @param id - The ID returned from registerCleanup/registerSyncCleanup
   * @returns True if the cleanup was found and removed
   */
  unregister(id: string): boolean {
    return this.cleanups.delete(id);
  }

  /**
   * Run only sync cleanups (for synchronous exit).
   */
  private runSyncCleanups(): void {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    const sorted = [...this.cleanups.values()]
      .filter((c) => c.type === 'sync')
      .sort((a, b) => b.priority - a.priority);

    for (const cleanup of sorted) {
      try {
        cleanup.fn();
        coreEvents.emit('cleanup:executed', { id: cleanup.id, success: true });
      } catch (error) {
        coreEvents.emit('cleanup:executed', {
          id: cleanup.id,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  /**
   * Run all cleanups (async and sync) in priority order.
   * Clears the cleanups after running.
   */
  async runAllCleanups(): Promise<void> {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    const sorted = [...this.cleanups.values()].sort((a, b) => b.priority - a.priority);

    for (const cleanup of sorted) {
      try {
        await cleanup.fn();
        coreEvents.emit('cleanup:executed', { id: cleanup.id, success: true });
      } catch (error) {
        coreEvents.emit('cleanup:executed', {
          id: cleanup.id,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    // Clear cleanups after running (they're one-time operations)
    this.cleanups.clear();
    this.isCleaningUp = false;
  }

  /**
   * Get the number of registered cleanups.
   */
  get size(): number {
    return this.cleanups.size;
  }

  /**
   * Clear all registered cleanups (useful for testing).
   */
  clear(): void {
    this.cleanups.clear();
    this.isCleaningUp = false;
  }

  /**
   * Reset the registry state (useful for testing).
   */
  reset(): void {
    this.clear();
    this.cleanupIdCounter = 0;
  }

  /**
   * Get info about all registered cleanups.
   */
  getAll(): Array<{ id: string; type: 'sync' | 'async'; priority: number }> {
    return [...this.cleanups.values()]
      .sort((a, b) => b.priority - a.priority)
      .map(({ id, type, priority }) => ({ id, type, priority }));
  }
}

// Singleton instance
const cleanupRegistry = new CleanupRegistry();

/**
 * Register an async cleanup function.
 *
 * @param fn - Cleanup function (can be async)
 * @param priority - Higher priority runs first (default: 0)
 * @returns Unique ID for unregistering
 */
export function registerCleanup(fn: CleanupFn, priority?: number): string {
  return cleanupRegistry.registerCleanup(fn, priority);
}

/**
 * Register a sync cleanup function.
 *
 * @param fn - Sync cleanup function
 * @param priority - Higher priority runs first (default: 0)
 * @returns Unique ID for unregistering
 */
export function registerSyncCleanup(fn: SyncCleanupFn, priority?: number): string {
  return cleanupRegistry.registerSyncCleanup(fn, priority);
}

/**
 * Unregister a cleanup function by ID.
 *
 * @param id - The ID returned from registerCleanup/registerSyncCleanup
 * @returns True if the cleanup was found and removed
 */
export function unregisterCleanup(id: string): boolean {
  return cleanupRegistry.unregister(id);
}

/**
 * Get the cleanup registry instance (for advanced usage or testing).
 */
export function getCleanupRegistry(): CleanupRegistry {
  return cleanupRegistry;
}

/**
 * Run all registered cleanups.
 */
export function runAllCleanups(): Promise<void> {
  return cleanupRegistry.runAllCleanups();
}

/**
 * Reset the cleanup registry (for testing).
 */
export function resetCleanupRegistry(): void {
  cleanupRegistry.reset();
}

/**
 * Get list of registered cleanups with their info (for testing/debugging).
 */
export function getRegisteredCleanups(): Array<{
  id: string;
  type: 'sync' | 'async';
  priority: number;
}> {
  return cleanupRegistry.getAll();
}
