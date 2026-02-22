import { beforeEach, describe, expect, mock, test } from 'bun:test';
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
      const args = (executor as any).buildArgs('test prompt');

      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
    });

    test('should include --silent flag', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test');

      expect(args).toContain('--silent');
    });

    test('should include --allow-all-tools flag', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test');

      expect(args).toContain('--allow-all-tools');
    });

    test('should not include --continue flag', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test');

      expect(args).not.toContain('--continue');
    });

    test('should include --log-level debug in debug mode', () => {
      process.env.DEBUG = '1';
      // biome-ignore lint/suspicious/noExplicitAny: Testing protected method
      const args = (executor as any).buildArgs('test');

      expect(args).toContain('--log-level');
      expect(args).toContain('debug');

      process.env.DEBUG = undefined;
    });
  });
});
