/**
 * Tests for error handling logic used in useMessageStreaming and related hooks.
 *
 * These tests verify the error message extraction logic to prevent
 * "Unknown error occurred" messages when errors are thrown.
 */
import { describe, expect, test } from 'bun:test';

/**
 * Error message extraction logic (mirrors useMessageStreaming.ts extractErrorMessage)
 * Uses duck typing first to handle cross-realm Error objects in bundled binaries.
 */
function extractErrorMessage(error: unknown): string {
  // Duck typing: check for message property first (handles cross-realm Errors)
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    // Only use message if it's a non-empty string
    if (typeof msg === 'string' && msg) {
      return msg;
    }
    // For non-string or empty message, try other extraction methods
  }

  // Standard Error check (also handles empty message via toString)
  if (error instanceof Error) {
    return error.message || error.toString();
  }

  // String error
  if (typeof error === 'string') {
    return error;
  }

  // Object without message property (or with non-string/empty message)
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  // Primitives (number, boolean, symbol, bigint)
  if (error !== undefined && error !== null) {
    return String(error);
  }

  // Unknown - add debug info
  return `Unknown error (type: ${typeof error})`;
}

describe('useMessageStreaming error handling', () => {
  describe('extractErrorMessage', () => {
    test('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      expect(extractErrorMessage(error)).toBe('Test error message');
    });

    test('should extract message from TypeError', () => {
      const error = new TypeError('Type mismatch');
      expect(extractErrorMessage(error)).toBe('Type mismatch');
    });

    test('should extract message from RangeError', () => {
      const error = new RangeError('Value out of range');
      expect(extractErrorMessage(error)).toBe('Value out of range');
    });

    test('should handle Error with empty message', () => {
      const error = new Error('');
      // Duck typing first checks message property which is empty string
      // Then falls through to instanceof which uses toString()
      expect(extractErrorMessage(error)).toBe('Error');
    });

    test('should handle string errors directly', () => {
      const error = 'Direct string error';
      expect(extractErrorMessage(error)).toBe('Direct string error');
    });

    test('should handle empty string error', () => {
      const error = '';
      expect(extractErrorMessage(error)).toBe('');
    });

    test('should extract message from plain object with message property', () => {
      const error = { message: 'Object error' };
      expect(extractErrorMessage(error)).toBe('Object error');
    });

    test('should handle object with null message', () => {
      const error = { message: null };
      // Falls through to JSON.stringify since message is not a non-empty string
      expect(extractErrorMessage(error)).toBe('{"message":null}');
    });

    test('should handle object with undefined message', () => {
      const error = { message: undefined };
      // Falls through to JSON.stringify (undefined is omitted in JSON)
      expect(extractErrorMessage(error)).toBe('{}');
    });

    test('should JSON stringify object without message', () => {
      const error = { code: 'ERR_NETWORK', status: 500 };
      expect(extractErrorMessage(error)).toBe('{"code":"ERR_NETWORK","status":500}');
    });

    test('should handle array as error', () => {
      const error = ['Error 1', 'Error 2'];
      expect(extractErrorMessage(error)).toBe('["Error 1","Error 2"]');
    });

    test('should handle number as error', () => {
      const error = 500;
      expect(extractErrorMessage(error)).toBe('500');
    });

    test('should handle boolean as error', () => {
      const error = false;
      expect(extractErrorMessage(error)).toBe('false');
    });

    test('should handle null as error', () => {
      const error = null;
      expect(extractErrorMessage(error)).toBe('Unknown error (type: object)');
    });

    test('should handle undefined as error', () => {
      const error = undefined;
      expect(extractErrorMessage(error)).toBe('Unknown error (type: undefined)');
    });

    test('should handle circular reference object', () => {
      const error: Record<string, unknown> = { name: 'circular' };
      error.self = error;
      // JSON.stringify will throw, should fall back to String()
      expect(extractErrorMessage(error)).toBe('[object Object]');
    });

    test('should handle DOMException', () => {
      const error = new DOMException('Operation aborted', 'AbortError');
      expect(extractErrorMessage(error)).toBe('Operation aborted');
    });

    test('should handle custom error class', () => {
      class APIError extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
          this.name = 'APIError';
        }
      }
      const error = new APIError('Not found', 404);
      expect(extractErrorMessage(error)).toBe('Not found');
    });

    test('should handle object with toJSON that throws', () => {
      const error = {
        toJSON() {
          throw new Error('toJSON failed');
        },
      };
      expect(extractErrorMessage(error)).toBe('[object Object]');
    });
  });

  describe('real-world error scenarios', () => {
    test('should handle fetch network error', () => {
      // Simulates what fetch might throw
      const error = new TypeError('Failed to fetch');
      expect(extractErrorMessage(error)).toBe('Failed to fetch');
    });

    test('should handle axios-like error object', () => {
      const error = {
        message: 'Request failed with status code 500',
        response: { status: 500, data: 'Internal Server Error' },
      };
      expect(extractErrorMessage(error)).toBe('Request failed with status code 500');
    });

    test('should handle skills package not found error', () => {
      const error = new Error(
        'Skills package not found. Please install it: npm install -g @clix-so/clix-agent-skills',
      );
      expect(extractErrorMessage(error)).toContain('Skills package not found');
      expect(extractErrorMessage(error)).toContain('npm install');
    });

    test('should handle CLI spawn error', () => {
      const error = new Error('spawn claude ENOENT');
      expect(extractErrorMessage(error)).toBe('spawn claude ENOENT');
    });

    test('should handle abort error', () => {
      const error = new DOMException('The operation was aborted', 'AbortError');
      expect(extractErrorMessage(error)).toBe('The operation was aborted');
    });

    test('should handle process exit error object', () => {
      const error = { code: 1, signal: null, message: 'Process exited with code 1' };
      expect(extractErrorMessage(error)).toBe('Process exited with code 1');
    });

    test('should handle JSON parse error', () => {
      const error = new SyntaxError('Unexpected token < in JSON at position 0');
      expect(extractErrorMessage(error)).toBe('Unexpected token < in JSON at position 0');
    });
  });

  describe('edge cases that caused "Unknown error occurred"', () => {
    /**
     * These test cases specifically target the scenarios that previously
     * resulted in "Unknown error occurred" being displayed.
     */

    test('should NOT return "Unknown error occurred" for Error instances', () => {
      const error = new Error('Specific error message');
      const message = extractErrorMessage(error);
      expect(message).not.toBe('Unknown error occurred');
      expect(message).toBe('Specific error message');
    });

    test('should NOT return "Unknown error occurred" for string errors', () => {
      const error = 'String error';
      const message = extractErrorMessage(error);
      expect(message).not.toBe('Unknown error occurred');
      expect(message).toBe('String error');
    });

    test('should NOT return "Unknown error occurred" for objects with message', () => {
      const error = { message: 'Error from object' };
      const message = extractErrorMessage(error);
      expect(message).not.toBe('Unknown error occurred');
      expect(message).toBe('Error from object');
    });

    test('should NOT return "Unknown error occurred" for objects without message', () => {
      const error = { code: 'ERR', detail: 'Detail' };
      const message = extractErrorMessage(error);
      expect(message).not.toBe('Unknown error occurred');
      expect(message).toBe('{"code":"ERR","detail":"Detail"}');
    });

    test('returns debug info for null/undefined, string representation for primitives', () => {
      // null/undefined get debug info
      expect(extractErrorMessage(null)).toBe('Unknown error (type: object)');
      expect(extractErrorMessage(undefined)).toBe('Unknown error (type: undefined)');
      // primitives get string representation
      expect(extractErrorMessage(123)).toBe('123');
      expect(extractErrorMessage(true)).toBe('true');
    });
  });
});
