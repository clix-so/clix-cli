import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  getRegisteredCleanups,
  registerCleanup,
  registerSyncCleanup,
  resetCleanupRegistry,
  runAllCleanups,
  unregisterCleanup,
} from '../cleanup/cleanup-registry';

describe('CleanupRegistry', () => {
  beforeEach(() => {
    resetCleanupRegistry();
  });

  afterEach(() => {
    resetCleanupRegistry();
  });

  describe('registerCleanup', () => {
    test('should register an async cleanup function', () => {
      const cleanup = mock(async () => {});
      const id = registerCleanup(cleanup);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(getRegisteredCleanups()).toHaveLength(1);
    });

    test('should register with custom priority', () => {
      const cleanup1 = mock(async () => {});
      const cleanup2 = mock(async () => {});

      registerCleanup(cleanup1, 10);
      registerCleanup(cleanup2, 5);

      const cleanups = getRegisteredCleanups();
      expect(cleanups).toHaveLength(2);
      // Higher priority should come first
      expect(cleanups[0]?.priority).toBe(10);
      expect(cleanups[1]?.priority).toBe(5);
    });
  });

  describe('registerSyncCleanup', () => {
    test('should register a sync cleanup function', () => {
      const cleanup = mock(() => {});
      const id = registerSyncCleanup(cleanup);

      expect(id).toBeDefined();
      expect(getRegisteredCleanups()).toHaveLength(1);
    });
  });

  describe('unregisterCleanup', () => {
    test('should remove a registered cleanup', () => {
      const cleanup = mock(async () => {});
      const id = registerCleanup(cleanup);

      expect(getRegisteredCleanups()).toHaveLength(1);

      const result = unregisterCleanup(id);

      expect(result).toBe(true);
      expect(getRegisteredCleanups()).toHaveLength(0);
    });

    test('should return false for non-existent cleanup', () => {
      const result = unregisterCleanup('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('runAllCleanups', () => {
    test('should run all registered cleanups', async () => {
      const cleanup1 = mock(async () => {});
      const cleanup2 = mock(async () => {});

      registerCleanup(cleanup1);
      registerCleanup(cleanup2);

      await runAllCleanups();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    test('should run cleanups in priority order', async () => {
      const order: number[] = [];
      const cleanup1 = mock(async () => {
        order.push(1);
      });
      const cleanup2 = mock(async () => {
        order.push(2);
      });
      const cleanup3 = mock(async () => {
        order.push(3);
      });

      registerCleanup(cleanup1, 5);
      registerCleanup(cleanup2, 10);
      registerCleanup(cleanup3, 1);

      await runAllCleanups();

      // Higher priority first
      expect(order).toEqual([2, 1, 3]);
    });

    test('should handle cleanup errors gracefully', async () => {
      const cleanup1 = mock(async () => {
        throw new Error('Cleanup error');
      });
      const cleanup2 = mock(async () => {});

      registerCleanup(cleanup1);
      registerCleanup(cleanup2);

      // Should not throw
      await runAllCleanups();

      // Both should have been called despite the error
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    test('should run sync cleanups', async () => {
      const syncCleanup = mock(() => {});
      const asyncCleanup = mock(async () => {});

      registerSyncCleanup(syncCleanup);
      registerCleanup(asyncCleanup);

      await runAllCleanups();

      expect(syncCleanup).toHaveBeenCalledTimes(1);
      expect(asyncCleanup).toHaveBeenCalledTimes(1);
    });

    test('should clear cleanups after running', async () => {
      const cleanup = mock(async () => {});
      registerCleanup(cleanup);

      await runAllCleanups();

      expect(getRegisteredCleanups()).toHaveLength(0);
    });
  });

  describe('resetCleanupRegistry', () => {
    test('should clear all registered cleanups', () => {
      registerCleanup(async () => {});
      registerCleanup(async () => {});

      expect(getRegisteredCleanups()).toHaveLength(2);

      resetCleanupRegistry();

      expect(getRegisteredCleanups()).toHaveLength(0);
    });
  });

  describe('getRegisteredCleanups', () => {
    test('should return cleanup info without exposing functions', () => {
      registerCleanup(async () => {}, 5);

      const cleanups = getRegisteredCleanups();

      expect(cleanups).toHaveLength(1);
      expect(cleanups[0]).toHaveProperty('id');
      expect(cleanups[0]).toHaveProperty('type');
      expect(cleanups[0]).toHaveProperty('priority');
      expect(cleanups[0]?.type).toBe('async');
      expect(cleanups[0]?.priority).toBe(5);
    });
  });
});
