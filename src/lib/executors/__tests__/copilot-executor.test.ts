import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConversationMessage } from '../../executor';
import { CopilotExecutor } from '../copilot-executor';

// Mock CLI process manager
const mockCommandExists = mock(async (_cmd: string) => true);
mock.module('../cli-process-manager', () => ({
  commandExists: mockCommandExists,
  parseTextLineStream: async function* () {
    // Empty by default, tests can override
  },
  spawnCLIProcess: () => ({
    process: { on: () => {}, killed: false, pid: 12345 },
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    kill: () => {},
  }),
  waitForProcessExit: async () => {},
}));

describe('CopilotExecutor', () => {
  let executor: CopilotExecutor;

  beforeEach(() => {
    executor = new CopilotExecutor();
    mockCommandExists.mockClear();
  });

  describe('name', () => {
    test('should be "copilot"', () => {
      expect(executor.name).toBe('copilot');
    });
  });

  describe('isAvailable', () => {
    test('should check for "copilot" command', async () => {
      await executor.isAvailable();
      expect(mockCommandExists).toHaveBeenCalledWith('copilot');
    });

    test('should return true when copilot is available', async () => {
      mockCommandExists.mockResolvedValue(true);
      const available = await executor.isAvailable();
      expect(available).toBe(true);
    });

    test('should return false when copilot is not available', async () => {
      mockCommandExists.mockResolvedValue(false);
      const available = await executor.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('buildArgs', () => {
    test('should include -p flag and prompt', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test prompt', { oneShot: true });

      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
    });

    test('should include --silent flag', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test', { oneShot: true });

      expect(args).toContain('--silent');
    });

    test('should include --allow-all-tools flag', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test', { oneShot: true });

      expect(args).toContain('--allow-all-tools');
    });

    test('should not include --continue in one-shot mode', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test', { oneShot: true });

      expect(args).not.toContain('--continue');
    });

    test('should include --continue in chat mode', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test', { oneShot: false });

      expect(args).toContain('--continue');
    });

    test('should include --log-level debug in debug mode', () => {
      process.env.DEBUG = '1';
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test', { oneShot: true });

      expect(args).toContain('--log-level');
      expect(args).toContain('debug');

      process.env.DEBUG = undefined;
    });
  });

  describe('history management', () => {
    test('should start with empty history', () => {
      expect(executor.getHistory()).toEqual([]);
    });

    test('should clear history', () => {
      executor.setHistory([
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'response' },
      ]);

      executor.clearHistory();
      expect(executor.getHistory()).toEqual([]);
    });

    test('should set history', () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'response' },
      ];

      executor.setHistory(history);
      expect(executor.getHistory()).toEqual(history);
    });
  });

  describe('session management', () => {
    test('should reset session', () => {
      // Set up some session state
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected property
      (executor as any).sessionId = 'test-session-123';

      executor.resetSession();

      // biome-ignore lint/suspicious/noExplicitAny: Testing protected property
      expect((executor as any).sessionId).toBeNull();
    });

    test('should reset session on compaction complete', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected property
      (executor as any).sessionId = 'test-session-123';
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      (executor as any).onCompactionComplete();

      // biome-ignore lint/suspicious/noExplicitAny: Testing protected property
      expect((executor as any).sessionId).toBeNull();
    });
  });
});
