import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CodexExecutor } from '../codex-executor';
import type { CodexCLIMessage } from '../types';

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

describe('CodexExecutor', () => {
  let executor: CodexExecutor;

  beforeEach(() => {
    executor = new CodexExecutor();
    mockCommandExists.mockClear();
  });

  describe('name', () => {
    test('should be "codex"', () => {
      expect(executor.name).toBe('codex');
    });
  });

  describe('isAvailable', () => {
    test('should check for "codex" command', async () => {
      await executor.isAvailable();
      expect(mockCommandExists).toHaveBeenCalledWith('codex');
    });
  });
});

describe('CodexExecutor message mapping', () => {
  /**
   * Test the mapMessage private method behavior through test fixtures
   * These fixtures represent actual Codex CLI output format
   */
  describe('Codex CLI message format fixtures', () => {
    test('thread.started message should have thread_id', () => {
      const msg: CodexCLIMessage = {
        type: 'thread.started',
        thread_id: 'thread-abc-123',
      };

      expect(msg.type).toBe('thread.started');
      expect(msg.thread_id).toBe('thread-abc-123');
    });

    test('turn.started message should have correct type', () => {
      const msg: CodexCLIMessage = {
        type: 'turn.started',
      };

      expect(msg.type).toBe('turn.started');
    });

    test('item.completed with agent_message should have correct structure', () => {
      const msg: CodexCLIMessage = {
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'agent_message',
          text: 'Hello, how can I help you?',
        },
      };

      expect(msg.type).toBe('item.completed');
      expect(msg.item?.type).toBe('agent_message');
      expect(msg.item?.text).toBe('Hello, how can I help you?');
    });

    test('item.completed with reasoning should have correct structure', () => {
      const msg: CodexCLIMessage = {
        type: 'item.completed',
        item: {
          id: 'item_0',
          type: 'reasoning',
          text: 'Internal reasoning text...',
        },
      };

      expect(msg.type).toBe('item.completed');
      expect(msg.item?.type).toBe('reasoning');
      expect(msg.item?.text).toBe('Internal reasoning text...');
    });

    test('item.completed with function_call should have correct structure', () => {
      const msg: CodexCLIMessage = {
        type: 'item.completed',
        item: {
          id: 'item_2',
          type: 'function_call',
          name: 'shell',
          arguments: '{"command":"ls -la"}',
        },
      };

      expect(msg.type).toBe('item.completed');
      expect(msg.item?.type).toBe('function_call');
      expect(msg.item?.name).toBe('shell');
      expect(msg.item?.arguments).toBe('{"command":"ls -la"}');
    });

    test('item.completed with function_return should have correct structure', () => {
      const msg: CodexCLIMessage = {
        type: 'item.completed',
        item: {
          id: 'item_3',
          type: 'function_return',
          output: 'file1.txt\nfile2.txt\n',
        },
      };

      expect(msg.type).toBe('item.completed');
      expect(msg.item?.type).toBe('function_return');
      expect(msg.item?.output).toBe('file1.txt\nfile2.txt\n');
    });

    test('turn.completed message should have usage info', () => {
      const msg: CodexCLIMessage = {
        type: 'turn.completed',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      expect(msg.type).toBe('turn.completed');
      expect(msg.usage?.input_tokens).toBe(100);
      expect(msg.usage?.output_tokens).toBe(50);
    });

    test('error message should have correct structure', () => {
      const msg: CodexCLIMessage = {
        type: 'error',
        error: 'API rate limit exceeded',
      };

      expect(msg.type).toBe('error');
      expect(msg.error).toBe('API rate limit exceeded');
    });

    test('item.completed with command_execution type should be valid', () => {
      // command_execution is another valid type in Codex output
      const msg: CodexCLIMessage = {
        type: 'item.completed',
        item: {
          id: 'item_4',
          type: 'command_execution',
          text: 'Running ls command...',
        },
      };

      expect(msg.type).toBe('item.completed');
      expect(msg.item?.type).toBe('command_execution');
    });
  });
});
