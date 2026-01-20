import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { OpenCodeExecutor } from '../opencode-executor';
import type { OpenCodeCLIMessage } from '../types';

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

describe('OpenCodeExecutor', () => {
  let executor: OpenCodeExecutor;

  beforeEach(() => {
    executor = new OpenCodeExecutor();
    mockCommandExists.mockClear();
  });

  describe('name', () => {
    test('should be "opencode"', () => {
      expect(executor.name).toBe('opencode');
    });
  });

  describe('isAvailable', () => {
    test('should check for "opencode" command', async () => {
      await executor.isAvailable();
      expect(mockCommandExists).toHaveBeenCalledWith('opencode');
    });
  });
});

describe('OpenCode CLI message format', () => {
  test('session event structure', () => {
    const msg: OpenCodeCLIMessage = {
      type: 'session',
      timestamp: 1768445719603,
      sessionID: 'ses_4406be0e0ffek7fDmqJpninhMz',
      model: 'gpt-4',
    };

    expect(msg.type).toBe('session');
    expect(msg.sessionID).toBe('ses_4406be0e0ffek7fDmqJpninhMz');
  });

  test('error event structure (confirmed)', () => {
    const msg: OpenCodeCLIMessage = {
      type: 'error',
      timestamp: 1768445719603,
      sessionID: 'ses_4406be0e0ffek7fDmqJpninhMz',
      error: {
        name: 'APIError',
        data: {
          message: 'API request failed',
          statusCode: 403,
          isRetryable: false,
        },
      },
    };

    expect(msg.type).toBe('error');
    expect(msg.error.name).toBe('APIError');
    expect(msg.error.data.statusCode).toBe(403);
  });

  test('message event structure', () => {
    const msg: OpenCodeCLIMessage = {
      type: 'message',
      timestamp: 1768445719603,
      content: 'Hello, how can I help?',
      role: 'assistant',
    };

    expect(msg.type).toBe('message');
    expect(msg.content).toBe('Hello, how can I help?');
  });

  test('tool_use event structure (actual format)', () => {
    const msg: OpenCodeCLIMessage = {
      type: 'tool_use',
      timestamp: 1768445719603,
      sessionID: 'ses_44030f84dffesSpuKyWxeqkJrr',
      part: {
        id: 'prt_bbfcf2c5900136VwMDppYp2wSV',
        sessionID: 'ses_44030f84dffesSpuKyWxeqkJrr',
        messageID: 'msg_bbfcf0907001etHJzGuFMyPIJ3',
        type: 'tool',
        callID: 'i2HhPndf2VyjKi47',
        tool: 'bash',
        state: {
          status: 'completed',
          input: { workdir: '/Users/test', description: 'Test', command: 'ls -F' },
          output: 'file.txt',
        },
      },
    };

    expect(msg.type).toBe('tool_use');
    expect(msg.part.tool).toBe('bash');
    expect(msg.part.callID).toBe('i2HhPndf2VyjKi47');
  });

  test('tool_result event structure (actual format)', () => {
    const msg: OpenCodeCLIMessage = {
      type: 'tool_result',
      timestamp: 1768445719603,
      sessionID: 'ses_44030f84dffesSpuKyWxeqkJrr',
      part: {
        id: 'prt_test123',
        callID: 'i2HhPndf2VyjKi47',
        state: {
          status: 'completed',
          output: 'File contents here',
        },
      },
    };

    expect(msg.type).toBe('tool_result');
    expect(msg.part.state?.output).toBe('File contents here');
  });
});
