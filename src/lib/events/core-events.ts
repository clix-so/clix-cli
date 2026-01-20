import { EventEmitter } from 'node:events';

/**
 * Core event types for cross-module communication.
 * Events are organized by domain:
 * - agent: Agent lifecycle and errors
 * - message: Message sending, streaming, completion
 * - tool: Tool execution lifecycle
 * - session: Session lifecycle
 * - config: Configuration changes
 * - error: Fatal error handling
 * - cleanup: Resource cleanup lifecycle
 */
export type CoreEventType =
  | 'agent:initialized'
  | 'agent:switched'
  | 'agent:error'
  | 'message:sent'
  | 'message:received'
  | 'message:streaming'
  | 'message:complete'
  | 'tool:started'
  | 'tool:completed'
  | 'tool:error'
  | 'session:started'
  | 'session:ended'
  | 'config:changed'
  | 'error:fatal'
  | 'cleanup:registered'
  | 'cleanup:executed'
  | 'update:available'
  | 'update:started'
  | 'update:completed'
  | 'update:failed';

/**
 * Payload types for each event.
 * Each event has a strongly-typed payload for type safety.
 */
export interface CoreEventPayloads {
  'agent:initialized': { agent: string; timestamp: Date };
  'agent:switched': { from: string; to: string; historyTransferred: boolean };
  'agent:error': { agent: string; error: Error; recoverable: boolean };
  'message:sent': { id: string; content: string; timestamp: Date };
  'message:received': { id: string; content: string; timestamp: Date };
  'message:streaming': { id: string; chunk: string; totalLength: number };
  'message:complete': { id: string; totalLength: number; timestamp: Date };
  'tool:started': { name: string; id: string; timestamp: Date };
  'tool:completed': { name: string; id: string; result?: unknown; duration: number };
  'tool:error': { name: string; id: string; error: Error };
  'session:started': { sessionId: string; agent: string; timestamp: Date };
  'session:ended': { sessionId: string; reason: string; duration: number };
  'config:changed': { key: string; oldValue?: unknown; newValue: unknown };
  'error:fatal': { error: Error; context?: string; recoverable: boolean };
  'cleanup:registered': { id: string; type: 'sync' | 'async'; priority: number };
  'cleanup:executed': { id: string; success: boolean; error?: Error };
  'update:available': { currentVersion: string; latestVersion: string; installationMethod: string };
  'update:started': { method: string; timestamp: Date };
  'update:completed': { oldVersion: string; newVersion: string; duration: number };
  'update:failed': { error: Error; method: string };
}

/**
 * Type-safe event listener function type.
 */
export type CoreEventListener<K extends CoreEventType> = (payload: CoreEventPayloads[K]) => void;

/**
 * Type-safe event emitter for cross-module communication.
 * Uses singleton pattern to ensure a single event bus across the application.
 *
 * @example
 * ```typescript
 * // Emit an event
 * coreEvents.emit('agent:initialized', { agent: 'claude', timestamp: new Date() });
 *
 * // Listen for an event
 * coreEvents.on('agent:initialized', ({ agent, timestamp }) => {
 *   console.log(`Agent ${agent} initialized at ${timestamp}`);
 * });
 *
 * // Listen once
 * coreEvents.once('session:ended', ({ sessionId, reason }) => {
 *   console.log(`Session ${sessionId} ended: ${reason}`);
 * });
 * ```
 */
class CoreEvents extends EventEmitter {
  private static instance: CoreEvents;

  private constructor() {
    super();
    // Allow many listeners for flexibility in larger applications
    this.setMaxListeners(50);
  }

  /**
   * Get the singleton instance of CoreEvents.
   */
  static getInstance(): CoreEvents {
    if (!CoreEvents.instance) {
      CoreEvents.instance = new CoreEvents();
    }
    return CoreEvents.instance;
  }

  /**
   * Emit a typed event with payload.
   */
  override emit<K extends CoreEventType>(event: K, payload: CoreEventPayloads[K]): boolean {
    return super.emit(event, payload);
  }

  /**
   * Add a typed event listener.
   */
  override on<K extends CoreEventType>(event: K, listener: CoreEventListener<K>): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Add a typed one-time event listener.
   */
  override once<K extends CoreEventType>(event: K, listener: CoreEventListener<K>): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Remove a typed event listener.
   */
  override off<K extends CoreEventType>(event: K, listener: CoreEventListener<K>): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Remove all listeners for an event type.
   */
  override removeAllListeners(event?: CoreEventType): this {
    return super.removeAllListeners(event);
  }

  /**
   * Get listener count for an event type.
   */
  override listenerCount(event: CoreEventType): number {
    return super.listenerCount(event);
  }

  /**
   * Reset the singleton instance (useful for testing).
   * Removes all listeners from the current instance.
   */
  static resetInstance(): void {
    if (CoreEvents.instance) {
      CoreEvents.instance.removeAllListeners();
    }
  }
}

/**
 * Singleton instance of the core event emitter.
 * Use this for all cross-module event communication.
 */
export const coreEvents = CoreEvents.getInstance();

/**
 * Reset the core events instance (for testing).
 * Removes all listeners but keeps the same instance.
 */
export function resetCoreEvents(): void {
  CoreEvents.resetInstance();
}
