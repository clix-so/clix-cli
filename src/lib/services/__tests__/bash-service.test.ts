import { describe, expect, test } from 'bun:test';
import {
  type BashExecutionResult,
  executeBash,
  formatBashForContext,
  formatBashResult,
} from '../bash-service';

describe('bash-service', () => {
  describe('executeBash', () => {
    test('executes simple command successfully', async () => {
      const result = await executeBash('echo "hello world"');

      expect(result.success).toBe(true);
      expect(result.command).toBe('echo "hello world"');
      expect(result.stdout).toBe('hello world');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.truncated).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('captures stderr for failed commands', async () => {
      const result = await executeBash('ls /nonexistent-directory-12345');

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    test('respects working directory option', async () => {
      const result = await executeBash('pwd', {
        workingDirectory: '/tmp',
      });

      expect(result.success).toBe(true);
      // macOS uses /private/tmp as the real path
      expect(result.stdout).toMatch(/\/tmp|\/private\/tmp/);
    });

    test('handles command timeout', async () => {
      const result = await executeBash('sleep 10', {
        timeout: 100, // 100ms timeout
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeNull();
      expect(result.stderr).toContain('timed out');
    });

    test('truncates output when exceeding maxOutput', async () => {
      // Generate output larger than 100 bytes
      const result = await executeBash('seq 1 100', {
        maxOutput: 100,
      });

      expect(result.truncated).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(100);
    });

    test('handles abort signal', async () => {
      const controller = new AbortController();

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      const result = await executeBash('sleep 10', {
        signal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeNull();
      expect(result.stderr).toContain('cancelled');
    });

    test('handles already aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await executeBash('echo "test"', {
        signal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('cancelled');
    });

    test('handles command with special characters', async () => {
      const result = await executeBash('echo "hello $USER"');

      expect(result.success).toBe(true);
      // $USER should be expanded by shell
      expect(result.stdout).toBeTruthy();
    });

    test('handles pipe commands', async () => {
      const result = await executeBash('echo "line1\nline2\nline3" | wc -l');

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('3');
    });

    test('handles command with exit code', async () => {
      const result = await executeBash('exit 42');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });
  });

  describe('formatBashResult', () => {
    test('formats successful result', () => {
      const result: BashExecutionResult = {
        success: true,
        command: 'ls',
        stdout: 'file1.txt\nfile2.txt',
        stderr: '',
        exitCode: 0,
        truncated: false,
        executionTimeMs: 100,
      };

      const formatted = formatBashResult(result);
      expect(formatted).toBe('file1.txt\nfile2.txt');
    });

    test('formats result with stderr', () => {
      const result: BashExecutionResult = {
        success: false,
        command: 'ls /nonexistent',
        stdout: '',
        stderr: 'No such file or directory',
        exitCode: 1,
        truncated: false,
        executionTimeMs: 100,
      };

      const formatted = formatBashResult(result);
      expect(formatted).toBe('No such file or directory');
    });

    test('formats result with both stdout and stderr', () => {
      const result: BashExecutionResult = {
        success: false,
        command: 'some-command',
        stdout: 'partial output',
        stderr: 'warning message',
        exitCode: 1,
        truncated: false,
        executionTimeMs: 100,
      };

      const formatted = formatBashResult(result);
      expect(formatted).toContain('partial output');
      expect(formatted).toContain('warning message');
    });

    test('includes truncation notice', () => {
      const result: BashExecutionResult = {
        success: true,
        command: 'cat large-file',
        stdout: 'truncated content',
        stderr: '',
        exitCode: 0,
        truncated: true,
        executionTimeMs: 100,
      };

      const formatted = formatBashResult(result);
      expect(formatted).toContain('truncated content');
      expect(formatted).toContain('(output truncated)');
    });
  });

  describe('formatBashForContext', () => {
    test('formats result for AI context', () => {
      const result: BashExecutionResult = {
        success: true,
        command: 'ls -la',
        stdout: 'total 0\ndrwxr-xr-x  2 user  staff  64 Jan 21 10:00 .',
        stderr: '',
        exitCode: 0,
        truncated: false,
        executionTimeMs: 100,
      };

      const formatted = formatBashForContext(result);

      expect(formatted).toContain('[User executed bash command]');
      expect(formatted).toContain('$ ls -la');
      expect(formatted).toContain('Output:');
      expect(formatted).toContain('total 0');
      expect(formatted).toContain('Exit code: 0');
    });

    test('formats killed process for AI context', () => {
      const result: BashExecutionResult = {
        success: false,
        command: 'sleep 100',
        stdout: '',
        stderr: 'Command was cancelled',
        exitCode: null,
        truncated: false,
        executionTimeMs: 100,
      };

      const formatted = formatBashForContext(result);

      expect(formatted).toContain('$ sleep 100');
      expect(formatted).toContain('Exit code: killed');
    });

    test('handles empty output', () => {
      const result: BashExecutionResult = {
        success: true,
        command: 'true',
        stdout: '',
        stderr: '',
        exitCode: 0,
        truncated: false,
        executionTimeMs: 10,
      };

      const formatted = formatBashForContext(result);

      expect(formatted).toContain('$ true');
      expect(formatted).toContain('(no output)');
      expect(formatted).toContain('Exit code: 0');
    });
  });
});
