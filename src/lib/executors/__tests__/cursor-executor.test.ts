import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CursorExecutor } from '../cursor-executor';
import type { CursorCLIMessage } from '../types';

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

describe('CursorExecutor', () => {
  let executor: CursorExecutor;

  beforeEach(() => {
    executor = new CursorExecutor();
    mockCommandExists.mockClear();
  });

  describe('name', () => {
    test('should be "cursor"', () => {
      expect(executor.name).toBe('cursor');
    });
  });

  describe('isAvailable', () => {
    test('should check for "agent" command', async () => {
      await executor.isAvailable();
      expect(mockCommandExists).toHaveBeenCalledWith('agent');
    });
  });
});

describe('Cursor CLI message format', () => {
  test('system init event structure', () => {
    const msg: CursorCLIMessage = {
      type: 'system',
      subtype: 'init',
      apiKeySource: 'login',
      cwd: '/path/to/workspace',
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      model: 'Auto',
      permissionMode: 'default',
    };

    expect(msg.type).toBe('system');
    expect(msg.subtype).toBe('init');
    expect(msg.session_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  test('thinking delta event structure', () => {
    const msg: CursorCLIMessage = {
      type: 'thinking',
      subtype: 'delta',
      text: 'Analyzing the code...',
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      timestamp_ms: 1768452215911,
    };

    expect(msg.type).toBe('thinking');
    expect(msg.subtype).toBe('delta');
    expect(msg.timestamp_ms).toBe(1768452215911);
  });

  test('assistant message with text content', () => {
    const msg: CursorCLIMessage = {
      type: 'assistant',
      session_id: 'test-session',
      message: {
        content: [{ type: 'text', text: 'Hello, I can help with that!' }],
      },
    };

    expect(msg.type).toBe('assistant');
    expect(msg.message?.content[0].type).toBe('text');
    expect(msg.message?.content[0].text).toBe('Hello, I can help with that!');
  });

  test('assistant message with tool_use', () => {
    const msg: CursorCLIMessage = {
      type: 'assistant',
      session_id: 'test-session',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Read',
            id: 'tool-abc123',
            input: { file_path: '/test/file.ts' },
          },
        ],
      },
    };

    expect(msg.type).toBe('assistant');
    expect(msg.message?.content[0].type).toBe('tool_use');
    expect(msg.message?.content[0].name).toBe('Read');
    expect(msg.message?.content[0].id).toBe('tool-abc123');
  });

  test('user message with tool_result', () => {
    const msg: CursorCLIMessage = {
      type: 'user',
      session_id: 'test-session',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-abc123',
            content: 'File contents here',
          },
        ],
      },
    };

    expect(msg.type).toBe('user');
    expect(msg.message?.content[0].type).toBe('tool_result');
    expect(msg.message?.content[0].content).toBe('File contents here');
  });

  test('result message with success', () => {
    const msg: CursorCLIMessage = {
      type: 'result',
      result: 'Task completed successfully',
      is_error: false,
      session_id: 'test-session',
    };

    expect(msg.type).toBe('result');
    expect(msg.is_error).toBe(false);
    expect(msg.result).toBe('Task completed successfully');
  });

  test('result message with error', () => {
    const msg: CursorCLIMessage = {
      type: 'result',
      result: 'Error: Something went wrong',
      is_error: true,
      session_id: 'test-session',
    };

    expect(msg.type).toBe('result');
    expect(msg.is_error).toBe(true);
    expect(msg.result).toBe('Error: Something went wrong');
  });
});
