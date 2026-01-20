import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createLogger, logger } from '../debug/logger';

describe('Logger', () => {
  const originalEnv = process.env.DEBUG;

  // Type-safe mock helper
  const getFirstCallArg = (mockFn: ReturnType<typeof mock>): string | undefined => {
    const calls = mockFn.mock.calls as unknown[][];
    return calls[0]?.[0] as string | undefined;
  };

  const consoleMocks = {
    log: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };

  beforeEach(() => {
    process.env.DEBUG = undefined;
    consoleMocks.log = mock(() => {});
    consoleMocks.info = mock(() => {});
    consoleMocks.warn = mock(() => {});
    consoleMocks.error = mock(() => {});
    console.log = consoleMocks.log;
    console.info = consoleMocks.info;
    console.warn = consoleMocks.warn;
    console.error = consoleMocks.error;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEBUG = originalEnv;
    } else {
      process.env.DEBUG = undefined;
    }
  });

  describe('debug mode detection', () => {
    test('should not log debug when DEBUG is not set', () => {
      logger.debug('test message');
      expect(consoleMocks.log).not.toHaveBeenCalled();
    });

    test('should log debug when DEBUG=true', () => {
      process.env.DEBUG = 'true';
      logger.debug('test message');
      expect(consoleMocks.log).toHaveBeenCalled();
    });

    test('should log debug when DEBUG=1', () => {
      process.env.DEBUG = '1';
      logger.debug('test message');
      expect(consoleMocks.log).toHaveBeenCalled();
    });

    test('should log debug when DEBUG=*', () => {
      process.env.DEBUG = '*';
      logger.debug('test message');
      expect(consoleMocks.log).toHaveBeenCalled();
    });

    test('should log debug when DEBUG matches namespace', () => {
      process.env.DEBUG = 'clix';
      logger.debug('test message');
      expect(consoleMocks.log).toHaveBeenCalled();
    });
  });

  describe('log levels', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true';
    });

    test('should log debug messages', () => {
      logger.debug('debug message');
      expect(consoleMocks.log).toHaveBeenCalled();
      const call = getFirstCallArg(consoleMocks.log);
      expect(call).toBeDefined();
      expect(call).toContain('[DEBUG]');
      expect(call).toContain('debug message');
    });

    test('should log info messages', () => {
      logger.info('info message');
      expect(consoleMocks.info).toHaveBeenCalled();
      const call = getFirstCallArg(consoleMocks.info);
      expect(call).toBeDefined();
      expect(call).toContain('[INFO]');
      expect(call).toContain('info message');
    });

    test('should log warn messages', () => {
      logger.warn('warn message');
      expect(consoleMocks.warn).toHaveBeenCalled();
      const call = getFirstCallArg(consoleMocks.warn);
      expect(call).toBeDefined();
      expect(call).toContain('[WARN]');
      expect(call).toContain('warn message');
    });

    test('should log error messages', () => {
      logger.error('error message');
      expect(consoleMocks.error).toHaveBeenCalled();
      const call = getFirstCallArg(consoleMocks.error);
      expect(call).toBeDefined();
      expect(call).toContain('[ERROR]');
      expect(call).toContain('error message');
    });
  });

  describe('always log warn and error', () => {
    test('should always log warn even when DEBUG is not set', () => {
      process.env.DEBUG = undefined;
      logger.warn('warning');
      expect(consoleMocks.warn).toHaveBeenCalled();
    });

    test('should always log error even when DEBUG is not set', () => {
      process.env.DEBUG = undefined;
      logger.error('error');
      expect(consoleMocks.error).toHaveBeenCalled();
    });
  });

  describe('context logging', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true';
    });

    test('should include context in log output', () => {
      logger.debug('test', { key: 'value', count: 42 });
      const call = getFirstCallArg(consoleMocks.log);
      expect(call).toBeDefined();
      expect(call).toContain('{"key":"value","count":42}');
    });

    test('should not include context if empty', () => {
      logger.debug('test');
      const call = getFirstCallArg(consoleMocks.log);
      expect(call).toBeDefined();
      expect(call).not.toContain('{}');
    });
  });

  describe('child logger', () => {
    test('should create child logger with nested namespace', () => {
      process.env.DEBUG = 'true';
      const childLogger = logger.child('agent');
      childLogger.debug('test');
      const call = getFirstCallArg(consoleMocks.log);
      expect(call).toBeDefined();
      expect(call).toContain('[clix:agent]');
    });

    test('should respect DEBUG namespace for child loggers', () => {
      process.env.DEBUG = 'clix:agent';
      const agentLogger = logger.child('agent');
      const configLogger = logger.child('config');

      agentLogger.debug('agent test');
      expect(consoleMocks.log).toHaveBeenCalled();

      consoleMocks.log.mockClear();
      configLogger.debug('config test');
      expect(consoleMocks.log).not.toHaveBeenCalled();
    });
  });

  describe('createLogger', () => {
    test('should create logger with custom namespace', () => {
      process.env.DEBUG = 'true';
      const customLogger = createLogger('custom');
      customLogger.debug('test');
      const call = getFirstCallArg(consoleMocks.log);
      expect(call).toBeDefined();
      expect(call).toContain('[custom]');
    });
  });

  describe('isEnabled', () => {
    test('should return false when DEBUG is not set', () => {
      process.env.DEBUG = undefined;
      expect(logger.isEnabled()).toBe(false);
    });

    test('should return true when DEBUG is set', () => {
      process.env.DEBUG = 'true';
      expect(logger.isEnabled()).toBe(true);
    });
  });

  describe('time', () => {
    test('should time async operations', async () => {
      process.env.DEBUG = 'true';
      const result = await logger.time('test operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result).toBe('done');
      const call = getFirstCallArg(consoleMocks.log);
      expect(call).toBeDefined();
      expect(call).toContain('test operation completed');
      expect(call).toContain('duration');
    });

    test('should log error when operation fails', async () => {
      process.env.DEBUG = 'true';
      const error = new Error('test error');

      await expect(
        logger.time('failing operation', async () => {
          throw error;
        }),
      ).rejects.toThrow('test error');

      const call = getFirstCallArg(consoleMocks.error);
      expect(call).toBeDefined();
      expect(call).toContain('failing operation failed');
      expect(call).toContain('test error');
    });

    test('should skip timing when DEBUG is disabled', async () => {
      process.env.DEBUG = undefined;
      const result = await logger.time('test', async () => 'result');

      expect(result).toBe('result');
      expect(consoleMocks.log).not.toHaveBeenCalled();
    });
  });
});
