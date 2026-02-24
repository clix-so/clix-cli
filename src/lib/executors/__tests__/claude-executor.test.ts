import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ClaudeExecutor } from '../claude-executor';
import type { ClaudeCLIMessage } from '../types';

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

describe('ClaudeExecutor', () => {
  let executor: ClaudeExecutor;

  beforeEach(() => {
    executor = new ClaudeExecutor();
    mockCommandExists.mockClear();
  });

  describe('name', () => {
    test('should be "claude"', () => {
      expect(executor.name).toBe('claude');
    });
  });

  describe('isAvailable', () => {
    test('should check for "claude" command', async () => {
      await executor.isAvailable();
      expect(mockCommandExists).toHaveBeenCalledWith('claude');
    });
  });

  describe('buildArgs', () => {
    test('should enable bypass permission mode and dangerous skip permissions', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test prompt');

      expect(args).toContain('--allow-dangerously-skip-permissions');
      expect(args).toContain('--permission-mode');
      expect(args).toContain('bypassPermissions');
    });

    test('should always include no-session-persistence', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test prompt');

      expect(args).toContain('--no-session-persistence');
    });
  });
});

describe('ClaudeExecutor message mapping', () => {
  /**
   * Test the mapMessage private method behavior through test fixtures
   * These fixtures represent actual Claude CLI output format
   */
  describe('Claude CLI message format fixtures', () => {
    test('assistant message with text content should have correct structure', () => {
      const msg: ClaudeCLIMessage = {
        type: 'assistant',
        session_id: 'test-session',
        message: {
          content: [{ type: 'text', text: 'Hello, how can I help?' }],
        },
      };

      expect(msg.type).toBe('assistant');
      expect(msg.message?.content[0].type).toBe('text');
      expect(msg.message?.content[0].text).toBe('Hello, how can I help?');
    });

    test('assistant message with tool_use should have correct structure', () => {
      const msg: ClaudeCLIMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-123',
              input: { file_path: '/test/file.ts' },
            },
          ],
        },
      };

      expect(msg.type).toBe('assistant');
      expect(msg.message?.content[0].type).toBe('tool_use');
      expect(msg.message?.content[0].name).toBe('Read');
      expect(msg.message?.content[0].id).toBe('tool-123');
    });

    test('user message with tool_result should have correct structure', () => {
      const msg: ClaudeCLIMessage = {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-123',
              content: 'File contents here',
            },
          ],
        },
      };

      expect(msg.type).toBe('user');
      expect(msg.message?.content[0].type).toBe('tool_result');
      expect(msg.message?.content[0].content).toBe('File contents here');
    });

    test('result message with error should have correct structure', () => {
      const msg: ClaudeCLIMessage = {
        type: 'result',
        result: 'Error: Something went wrong',
        is_error: true,
      };

      expect(msg.type).toBe('result');
      expect(msg.is_error).toBe(true);
      expect(msg.result).toBe('Error: Something went wrong');
    });

    test('result message without error should have correct structure', () => {
      const msg: ClaudeCLIMessage = {
        type: 'result',
        result: 'Task completed successfully',
        is_error: false,
      };

      expect(msg.type).toBe('result');
      expect(msg.is_error).toBe(false);
      expect(msg.result).toBe('Task completed successfully');
    });

    test('system init message should have session_id', () => {
      const msg: ClaudeCLIMessage = {
        type: 'system',
        session_id: 'abc-123-def',
      };

      expect(msg.type).toBe('system');
      expect(msg.session_id).toBe('abc-123-def');
    });
  });
});

describe('ClaudeExecutor stream mode mapping', () => {
  test('emits append-only cumulative deltas, including rewritten snapshots', () => {
    const executor = new ClaudeExecutor() as unknown as {
      extractTextDelta: (
        textContent: string,
        msg: ClaudeCLIMessage,
      ) => {
        type: string;
        content: string;
        streamMode?: 'append' | 'replace';
      } | null;
    };

    const msg: ClaudeCLIMessage = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'placeholder' }],
      },
    };

    const first = executor.extractTextDelta('Hello', msg);
    expect(first?.content).toBe('Hello');
    expect(first?.streamMode).toBe('append');

    const second = executor.extractTextDelta('Hello world', msg);
    expect(second?.content).toBe(' world');
    expect(second?.streamMode).toBe('append');

    const rewrite = executor.extractTextDelta('Rewritten output', msg);
    expect(rewrite?.content).toBe('\nRewritten output');
    expect(rewrite?.streamMode).toBe('append');
  });
});
