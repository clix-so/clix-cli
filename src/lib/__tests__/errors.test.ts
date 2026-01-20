import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createErrorHandler,
  getUserMessage,
  handleError,
  logError,
  toClixError,
} from '../errors/handler';
import {
  ERROR_MESSAGES,
  getErrorMessage,
  isNetworkError,
  isTimeoutError,
} from '../errors/messages';
import {
  AgentError,
  ClixError,
  ConfigError,
  ERROR_CODES,
  NetworkError,
  SessionError,
  ToolError,
  ValidationError,
} from '../errors/types';
import { resetCoreEvents } from '../events/core-events';

describe('Error Types', () => {
  describe('ClixError', () => {
    test('should create error with all properties', () => {
      const error = new ClixError('Test error', ERROR_CODES.UNKNOWN_ERROR, true, { foo: 'bar' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual({ foo: 'bar' });
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.name).toBe('ClixError');
    });

    test('should have correct default recoverable value', () => {
      const error = new ClixError('Test', ERROR_CODES.UNKNOWN_ERROR);
      expect(error.recoverable).toBe(true);
    });

    test('toJSON should return serializable object', () => {
      const error = new ClixError('Test error', ERROR_CODES.NETWORK_ERROR, false, { url: 'test' });
      const json = error.toJSON();

      expect(json.name).toBe('ClixError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe(ERROR_CODES.NETWORK_ERROR);
      expect(json.recoverable).toBe(false);
      expect(json.context).toEqual({ url: 'test' });
      expect(typeof json.timestamp).toBe('string');
    });
  });

  describe('AgentError', () => {
    test('should create with agent name', () => {
      const error = new AgentError('Agent failed', 'claude');

      expect(error.agentName).toBe('claude');
      expect(error.code).toBe(ERROR_CODES.AGENT_EXECUTION_FAILED);
      expect(error.name).toBe('AgentError');
    });

    test('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new AgentError('Agent failed', 'claude', undefined, cause);

      expect(error.cause).toBe(cause);
      expect(error.context?.cause).toBe('Original error');
    });
  });

  describe('ConfigError', () => {
    test('should create with config key', () => {
      const error = new ConfigError('Invalid config', ERROR_CODES.CONFIG_INVALID, 'theme');

      expect(error.configKey).toBe('theme');
      expect(error.code).toBe(ERROR_CODES.CONFIG_INVALID);
      expect(error.name).toBe('ConfigError');
    });
  });

  describe('NetworkError', () => {
    test('should create with url and status code', () => {
      const error = new NetworkError('Request failed', 'https://api.example.com', 500);

      expect(error.url).toBe('https://api.example.com');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ERROR_CODES.NETWORK_ERROR);
      expect(error.name).toBe('NetworkError');
    });
  });

  describe('ValidationError', () => {
    test('should create with field and value', () => {
      const error = new ValidationError('Invalid email', 'email', 'not-an-email');

      expect(error.field).toBe('email');
      expect(error.value).toBe('not-an-email');
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('ToolError', () => {
    test('should create with tool name', () => {
      const error = new ToolError('Tool failed', 'search');

      expect(error.toolName).toBe('search');
      expect(error.code).toBe(ERROR_CODES.TOOL_EXECUTION_FAILED);
      expect(error.name).toBe('ToolError');
    });
  });

  describe('SessionError', () => {
    test('should create with session id', () => {
      const error = new SessionError('Session expired', ERROR_CODES.SESSION_EXPIRED, 'session-123');

      expect(error.sessionId).toBe('session-123');
      expect(error.code).toBe(ERROR_CODES.SESSION_EXPIRED);
      expect(error.name).toBe('SessionError');
    });
  });
});

describe('Error Messages', () => {
  describe('ERROR_MESSAGES', () => {
    test('template functions should return formatted messages', () => {
      expect(ERROR_MESSAGES.AGENT_NOT_FOUND('claude')).toContain('claude');
      expect(ERROR_MESSAGES.AGENT_NOT_AVAILABLE('codex', 'https://example.com')).toContain('codex');
      expect(ERROR_MESSAGES.UNKNOWN_COMMAND('test')).toContain('/test');
    });
  });

  describe('getErrorMessage', () => {
    test('should return error message for Error instances', () => {
      const error = new Error('Test message');
      expect(getErrorMessage(error)).toBe('Test message');
    });

    test('should return generic message for unknown errors', () => {
      expect(getErrorMessage('string error')).toBe(ERROR_MESSAGES.UNKNOWN_ERROR);
      expect(getErrorMessage(null)).toBe(ERROR_MESSAGES.UNKNOWN_ERROR);
    });
  });

  describe('isNetworkError', () => {
    test('should detect network errors', () => {
      expect(isNetworkError(new Error('network error occurred'))).toBe(true);
      expect(isNetworkError(new Error('fetch failed'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
    });

    test('should return false for non-network errors', () => {
      expect(isNetworkError(new Error('validation failed'))).toBe(false);
      expect(isNetworkError('not an error')).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    test('should detect timeout errors', () => {
      expect(isTimeoutError(new Error('timeout'))).toBe(true);
      expect(isTimeoutError(new Error('ETIMEDOUT'))).toBe(true);
    });

    test('should return false for non-timeout errors', () => {
      expect(isTimeoutError(new Error('network error'))).toBe(false);
    });
  });
});

describe('Error Handler', () => {
  beforeEach(() => {
    resetCoreEvents();
  });

  afterEach(() => {
    resetCoreEvents();
  });

  describe('toClixError', () => {
    test('should return ClixError as-is', () => {
      const original = new ClixError('Test', ERROR_CODES.UNKNOWN_ERROR);
      const result = toClixError(original);

      expect(result).toBe(original);
    });

    test('should convert Error to ClixError', () => {
      const original = new Error('Test error');
      const result = toClixError(original);

      expect(result).toBeInstanceOf(ClixError);
      expect(result.message).toBe('Test error');
    });

    test('should detect network errors', () => {
      const original = new Error('ECONNREFUSED');
      const result = toClixError(original);

      expect(result.code).toBe(ERROR_CODES.NETWORK_ERROR);
    });

    test('should detect timeout errors', () => {
      const original = new Error('ETIMEDOUT');
      const result = toClixError(original);

      expect(result.code).toBe(ERROR_CODES.NETWORK_TIMEOUT);
    });

    test('should convert string to ClixError', () => {
      const result = toClixError('String error');

      expect(result).toBeInstanceOf(ClixError);
      expect(result.message).toBe('String error');
    });

    test('should handle unknown types', () => {
      const result = toClixError({ some: 'object' });

      expect(result).toBeInstanceOf(ClixError);
      expect(result.recoverable).toBe(false);
    });
  });

  describe('handleError', () => {
    test('should convert and return error result', () => {
      const error = new Error('Test error');
      const result = handleError(error, { emitEvents: false });

      expect(result.error).toBeInstanceOf(ClixError);
      expect(result.message).toBeDefined();
      expect(typeof result.recoverable).toBe('boolean');
    });

    test('should rethrow when requested', () => {
      const error = new Error('Test error');

      expect(() => handleError(error, { emitEvents: false, rethrow: true })).toThrow(ClixError);
    });
  });

  describe('getUserMessage', () => {
    test('should return error message if user-friendly', () => {
      const error = new ClixError('User friendly message', ERROR_CODES.UNKNOWN_ERROR);
      expect(getUserMessage(error)).toBe('User friendly message');
    });

    test('should return generic message for network errors', () => {
      const error = new ClixError('Error: something', ERROR_CODES.NETWORK_ERROR);
      expect(getUserMessage(error)).toBe(ERROR_MESSAGES.NETWORK_UNAVAILABLE);
    });

    test('should return generic message for timeout errors', () => {
      const error = new ClixError('Error: timeout', ERROR_CODES.NETWORK_TIMEOUT);
      expect(getUserMessage(error)).toBe(ERROR_MESSAGES.NETWORK_TIMEOUT);
    });
  });

  describe('createErrorHandler', () => {
    test('should create handler with context', () => {
      const handleAgentError = createErrorHandler('agent', { emitEvents: false });
      const result = handleAgentError(new Error('Test'));

      expect(result.error).toBeInstanceOf(ClixError);
    });
  });

  describe('logError', () => {
    test('should not throw', () => {
      const error = new ClixError('Test', ERROR_CODES.UNKNOWN_ERROR);
      expect(() => logError(error, 'test-context')).not.toThrow();
    });
  });
});
