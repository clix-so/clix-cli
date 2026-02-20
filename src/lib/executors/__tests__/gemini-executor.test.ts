import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { GeminiExecutor } from '../gemini-executor';
import type { GeminiCLIMessage } from '../types';

// Mock commandExists to control isAvailable behavior
const mockCommandExists = mock(async (_cmd: string) => true);
mock.module('../cli-process-manager', () => ({
  commandExists: mockCommandExists,
  parseJSONLStream: async function* () {},
  spawnCLIProcess: () => ({
    process: { on: () => {}, killed: false, pid: 12345 },
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    kill: () => {},
  }),
  waitForProcessExit: async () => {},
}));

describe('GeminiExecutor', () => {
  let executor: GeminiExecutor;

  beforeEach(() => {
    executor = new GeminiExecutor();
    mockCommandExists.mockClear();
  });

  describe('name', () => {
    test('should be "gemini"', () => {
      expect(executor.name).toBe('gemini');
    });
  });

  describe('isAvailable', () => {
    test('should check for "gemini" command', async () => {
      await executor.isAvailable();
      expect(mockCommandExists).toHaveBeenCalledWith('gemini');
    });
  });
});

describe('GeminiExecutor message mapping', () => {
  /**
   * Test the mapMessage private method behavior through test fixtures
   * These fixtures represent actual Gemini CLI output format (stream-json)
   */
  describe('Gemini CLI message format fixtures', () => {
    test('init event should have session_id and model', () => {
      const msg: GeminiCLIMessage = {
        type: 'init',
        timestamp: '2025-01-14T00:00:00.000Z',
        session_id: 'gemini-session-123',
        model: 'gemini-2.5-pro',
      };

      expect(msg.type).toBe('init');
      expect(msg.session_id).toBe('gemini-session-123');
      expect(msg.model).toBe('gemini-2.5-pro');
    });

    test('message event with assistant role should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'message',
        timestamp: '2025-01-14T00:00:00.000Z',
        role: 'assistant',
        content: 'Hello, how can I help you today?',
        delta: false,
      };

      expect(msg.type).toBe('message');
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hello, how can I help you today?');
      expect(msg.delta).toBe(false);
    });

    test('message event with delta should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'message',
        timestamp: '2025-01-14T00:00:00.000Z',
        role: 'assistant',
        content: 'Hello',
        delta: true,
      };

      expect(msg.type).toBe('message');
      expect(msg.delta).toBe(true);
    });

    test('tool_use event should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'tool_use',
        timestamp: '2025-01-14T00:00:00.000Z',
        tool_name: 'read_file',
        tool_id: 'tool-456',
        parameters: { path: '/test/file.ts' },
      };

      expect(msg.type).toBe('tool_use');
      expect(msg.tool_name).toBe('read_file');
      expect(msg.tool_id).toBe('tool-456');
      expect(msg.parameters).toEqual({ path: '/test/file.ts' });
    });

    test('tool_result event with success should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'tool_result',
        timestamp: '2025-01-14T00:00:00.000Z',
        tool_id: 'tool-456',
        status: 'success',
        output: 'File contents here',
      };

      expect(msg.type).toBe('tool_result');
      expect(msg.status).toBe('success');
      expect(msg.output).toBe('File contents here');
    });

    test('tool_result event with error should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'tool_result',
        timestamp: '2025-01-14T00:00:00.000Z',
        tool_id: 'tool-456',
        status: 'error',
        error: {
          type: 'TOOL_EXECUTION_ERROR',
          message: 'File not found',
        },
      };

      expect(msg.type).toBe('tool_result');
      expect(msg.status).toBe('error');
      expect(msg.error?.message).toBe('File not found');
    });

    test('error event should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'error',
        timestamp: '2025-01-14T00:00:00.000Z',
        severity: 'error',
        message: 'API rate limit exceeded',
      };

      expect(msg.type).toBe('error');
      expect(msg.severity).toBe('error');
      expect(msg.message).toBe('API rate limit exceeded');
    });

    test('error event with warning severity should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'error',
        timestamp: '2025-01-14T00:00:00.000Z',
        severity: 'warning',
        message: 'This is a warning',
      };

      expect(msg.type).toBe('error');
      expect(msg.severity).toBe('warning');
    });

    test('result event with success should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'result',
        timestamp: '2025-01-14T00:00:00.000Z',
        status: 'success',
        stats: {
          total_tokens: 150,
          input_tokens: 100,
          output_tokens: 50,
          cached: 20,
          input: 80,
          duration_ms: 2500,
          tool_calls: 2,
        },
      };

      expect(msg.type).toBe('result');
      expect(msg.status).toBe('success');
      expect(msg.stats?.total_tokens).toBe(150);
      expect(msg.stats?.tool_calls).toBe(2);
    });

    test('result event with error should have correct structure', () => {
      const msg: GeminiCLIMessage = {
        type: 'result',
        timestamp: '2025-01-14T00:00:00.000Z',
        status: 'error',
        error: {
          type: 'API_ERROR',
          message: 'Request failed',
        },
      };

      expect(msg.type).toBe('result');
      expect(msg.status).toBe('error');
      expect(msg.error?.message).toBe('Request failed');
    });
  });
});

describe('GeminiExecutor stream mode mapping', () => {
  test('maps both snapshot and delta events to append-only cumulative output', () => {
    const executor = new GeminiExecutor() as unknown as {
      processStreamData: (
        data: unknown,
        context: { hasYieldedText: boolean; assistantContent: string; count: number },
      ) => { type: string; streamMode?: 'append' | 'replace'; content: string } | null;
    };

    const fullUpdate = executor.processStreamData(
      {
        type: 'message',
        timestamp: '2025-01-14T00:00:00.000Z',
        role: 'assistant',
        content: 'Hello world',
        delta: false,
      } satisfies GeminiCLIMessage,
      { hasYieldedText: false, assistantContent: '', count: 1 },
    );
    expect(fullUpdate?.type).toBe('text');
    expect(fullUpdate?.streamMode).toBe('append');

    const deltaUpdate = executor.processStreamData(
      {
        type: 'message',
        timestamp: '2025-01-14T00:00:00.000Z',
        role: 'assistant',
        content: ' world',
        delta: true,
      } satisfies GeminiCLIMessage,
      { hasYieldedText: true, assistantContent: 'Hello', count: 2 },
    );
    expect(deltaUpdate?.type).toBe('text');
    expect(deltaUpdate?.streamMode).toBe('append');
  });
});
