/**
 * Event system for cross-module communication.
 *
 * @module events
 */
export {
  type CoreEventListener,
  type CoreEventPayloads,
  type CoreEventType,
  coreEvents,
  resetCoreEvents,
} from './core-events';
