import { join } from 'node:path';
import { spawn } from 'bun';

export interface CLIRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface CLIRunOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Test rig for running CLI commands in E2E tests.
 */
export class CLITestRig {
  private cliPath: string;
  private defaultTimeout: number;

  constructor(options?: { timeout?: number }) {
    // Use the built dist/cli.js file
    this.cliPath = join(import.meta.dir, '../../dist/cli.js');
    this.defaultTimeout = options?.timeout ?? 10000;
  }

  /**
   * Runs a CLI command and returns the result.
   */
  async run(args: string[], options?: CLIRunOptions): Promise<CLIRunResult> {
    const timeout = options?.timeout ?? this.defaultTimeout;
    const cwd = options?.cwd ?? process.cwd();

    const proc = spawn({
      cmd: ['bun', 'run', this.cliPath, ...args],
      cwd,
      env: {
        ...process.env,
        ...options?.env,
        // Force non-interactive mode
        CI: 'true',
        // Skip first-run setup for E2E tests
        CLIX_SKIP_SETUP: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    // Read stdout
    const stdoutReader = proc.stdout.getReader();
    const stderrReader = proc.stderr.getReader();

    const readOutput = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      target: 'stdout' | 'stderr',
    ) => {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (target === 'stdout') {
          stdout += decoder.decode(value, { stream: true });
        } else {
          stderr += decoder.decode(value, { stream: true });
        }
      }
    };

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      await Promise.race([
        Promise.all([
          readOutput(stdoutReader, 'stdout'),
          readOutput(stderrReader, 'stderr'),
          proc.exited,
        ]),
        timeoutPromise,
      ]);

      return {
        stdout,
        stderr,
        exitCode: proc.exitCode,
      };
    } catch (error) {
      proc.kill();
      throw error;
    }
  }

  /**
   * Runs a CLI command and expects it to succeed (exit code 0).
   */
  async runSuccess(args: string[], options?: CLIRunOptions): Promise<CLIRunResult> {
    const result = await this.run(args, options);

    if (result.exitCode !== 0) {
      throw new Error(
        `CLI command failed with exit code ${result.exitCode}\n` +
          `stdout: ${result.stdout}\n` +
          `stderr: ${result.stderr}`,
      );
    }

    return result;
  }

  /**
   * Runs a CLI command and expects it to fail (exit code non-zero).
   */
  async runFailure(args: string[], options?: CLIRunOptions): Promise<CLIRunResult> {
    const result = await this.run(args, options);

    if (result.exitCode === 0) {
      throw new Error(
        `CLI command unexpectedly succeeded\n` +
          `stdout: ${result.stdout}\n` +
          `stderr: ${result.stderr}`,
      );
    }

    return result;
  }
}

/**
 * Creates a test rig instance with default configuration.
 */
export function createTestRig(options?: { timeout?: number }): CLITestRig {
  return new CLITestRig(options);
}
