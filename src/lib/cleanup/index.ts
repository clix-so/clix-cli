/**
 * Cleanup system for resource management.
 *
 * @module cleanup
 */
export {
  type CleanupFn,
  getCleanupRegistry,
  getRegisteredCleanups,
  registerCleanup,
  registerSyncCleanup,
  resetCleanupRegistry,
  runAllCleanups,
  type SyncCleanupFn,
  unregisterCleanup,
} from './cleanup-registry';
