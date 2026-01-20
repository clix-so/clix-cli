import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { coreEvents, resetCoreEvents } from '../events/core-events';

describe('CoreEvents', () => {
  // Use fresh instance for each test by resetting before
  beforeEach(() => {
    resetCoreEvents();
  });

  afterEach(() => {
    // Clean up all listeners after each test
    coreEvents.removeAllListeners();
  });

  describe('emit and on', () => {
    test('should emit and receive agent:initialized event', () => {
      const listener = mock(() => {});
      coreEvents.on('agent:initialized', listener);

      const payload = { agent: 'claude', timestamp: new Date() };
      coreEvents.emit('agent:initialized', payload);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    test('should emit and receive message:streaming event', () => {
      const listener = mock(() => {});
      coreEvents.on('message:streaming', listener);

      const payload = { id: '123', chunk: 'Hello', totalLength: 100 };
      coreEvents.emit('message:streaming', payload);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    test('should emit and receive error:fatal event', () => {
      const listener = mock(() => {});
      coreEvents.on('error:fatal', listener);

      const payload = { error: new Error('Test error'), context: 'test', recoverable: false };
      coreEvents.emit('error:fatal', payload);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  describe('once', () => {
    test('should only trigger listener once', () => {
      const listener = mock(() => {});
      coreEvents.once('session:started', listener);

      const payload = { sessionId: '123', agent: 'claude', timestamp: new Date() };
      coreEvents.emit('session:started', payload);
      coreEvents.emit('session:started', payload);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    test('should remove listener', () => {
      const listener = mock(() => {});
      coreEvents.on('config:changed', listener);

      const payload = { key: 'theme', oldValue: 'dark', newValue: 'light' };
      coreEvents.emit('config:changed', payload);

      coreEvents.off('config:changed', listener);
      coreEvents.emit('config:changed', payload);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('listenerCount', () => {
    test('should return correct listener count', () => {
      expect(coreEvents.listenerCount('agent:initialized')).toBe(0);

      const listener1 = mock(() => {});
      const listener2 = mock(() => {});

      coreEvents.on('agent:initialized', listener1);
      expect(coreEvents.listenerCount('agent:initialized')).toBe(1);

      coreEvents.on('agent:initialized', listener2);
      expect(coreEvents.listenerCount('agent:initialized')).toBe(2);

      coreEvents.off('agent:initialized', listener1);
      expect(coreEvents.listenerCount('agent:initialized')).toBe(1);
    });
  });

  describe('removeAllListeners', () => {
    test('should remove all listeners for an event', () => {
      const listener1 = mock(() => {});
      const listener2 = mock(() => {});

      coreEvents.on('tool:started', listener1);
      coreEvents.on('tool:started', listener2);

      expect(coreEvents.listenerCount('tool:started')).toBe(2);

      coreEvents.removeAllListeners('tool:started');

      expect(coreEvents.listenerCount('tool:started')).toBe(0);
    });
  });

  describe('resetCoreEvents', () => {
    test('should remove all listeners', () => {
      const listener = mock(() => {});
      coreEvents.on('agent:initialized', listener);

      expect(coreEvents.listenerCount('agent:initialized')).toBe(1);

      resetCoreEvents();

      // All listeners should be removed
      expect(coreEvents.listenerCount('agent:initialized')).toBe(0);

      // Listener should not be called after reset
      coreEvents.emit('agent:initialized', { agent: 'test', timestamp: new Date() });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('multiple event types', () => {
    test('should handle multiple event types independently', () => {
      const agentListener = mock(() => {});
      const messageListener = mock(() => {});

      coreEvents.on('agent:switched', agentListener);
      coreEvents.on('message:complete', messageListener);

      coreEvents.emit('agent:switched', { from: 'claude', to: 'codex', historyTransferred: true });

      expect(agentListener).toHaveBeenCalledTimes(1);
      expect(messageListener).not.toHaveBeenCalled();

      coreEvents.emit('message:complete', { id: '123', totalLength: 500, timestamp: new Date() });

      expect(agentListener).toHaveBeenCalledTimes(1);
      expect(messageListener).toHaveBeenCalledTimes(1);
    });
  });
});
