/**
 * Bash command execution service.
 *
 * Executes shell commands and captures output while maintaining
 * conversation context in the CLI.
 */
import { spawn } from 'node:child_process';

/**
 * Result of bash command execution.
 */
export interface BashExecutionResult {
  /** Whether the command executed successfully (exit code 0) */
  success: boolean;
  /** The command that was executed */
  command: string;
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code, null if process was killed */
  exitCode: number | null;
  /** Whether output was truncated due to size limit */
  truncated: boolean;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Options for bash command execution.
 */
export interface BashExecutionOptions {
  /** Timeout in milliseconds (default: 120000ms / 2 minutes) */
  timeout?: number;
  /** Maximum output size in bytes (default: 30720 / 30KB) */
  maxOutput?: number;
  /** Working directory for command execution */
  workingDirectory?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Default timeout: 2 minutes */
const DEFAULT_TIMEOUT = 120000;

/** Default max output: 30KB */
const DEFAULT_MAX_OUTPUT = 30720;

/**
 * Executes a bash command and returns the result.
 *
 * @param command - The command to execute
 * @param options - Execution options
 * @returns Promise resolving to execution result
 */
export async function executeBash(
  command: string,
  options: BashExecutionOptions = {},
): Promise<BashExecutionResult> {
  const {
    timeout = DEFAULT_TIMEOUT,
    maxOutput = DEFAULT_MAX_OUTPUT,
    workingDirectory = process.cwd(),
    signal,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let totalOutputSize = 0;

    // Spawn shell process
    const child = spawn(command, {
      shell: true,
      cwd: workingDirectory,
      env: process.env,
    });

    // Track if process is already handled
    let handled = false;

    const handleResult = (exitCode: number | null) => {
      if (handled) return;
      handled = true;

      resolve({
        success: exitCode === 0,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        truncated,
        executionTimeMs: Date.now() - startTime,
      });
    };

    // Create data handler for stdout/stderr with byte-accurate truncation
    const createDataHandler = (appendTo: 'stdout' | 'stderr') => (data: Buffer) => {
      const chunkSize = data.length;
      totalOutputSize += chunkSize;

      if (totalOutputSize <= maxOutput) {
        if (appendTo === 'stdout') {
          stdout += data.toString();
        } else {
          stderr += data.toString();
        }
      } else if (!truncated) {
        // Truncate at byte boundary
        const remaining = maxOutput - (totalOutputSize - chunkSize);
        if (remaining > 0) {
          const truncatedData = data.subarray(0, remaining).toString();
          if (appendTo === 'stdout') {
            stdout += truncatedData;
          } else {
            stderr += truncatedData;
          }
        }
        truncated = true;
      }
    };

    child.stdout?.on('data', createDataHandler('stdout'));
    child.stderr?.on('data', createDataHandler('stderr'));

    // Handle process exit
    child.on('close', (code) => {
      handleResult(code);
    });

    // Handle process error
    child.on('error', (error) => {
      stderr = error.message;
      handleResult(1);
    });

    // Handle timeout
    const timeoutId = setTimeout(() => {
      if (!handled) {
        child.kill('SIGTERM');
        stderr = `Command timed out after ${timeout}ms`;
        handleResult(null);
      }
    }, timeout);

    // Cleanup timeout on process end
    child.on('close', () => {
      clearTimeout(timeoutId);
    });

    // Handle abort signal
    if (signal) {
      const abortHandler = () => {
        if (!handled) {
          child.kill('SIGTERM');
          stderr = 'Command was cancelled';
          handleResult(null);
        }
      };

      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
        child.on('close', () => {
          signal.removeEventListener('abort', abortHandler);
        });
      }
    }
  });
}

/**
 * Formats bash execution result for display.
 *
 * @param result - The execution result
 * @returns Formatted string for display
 */
export function formatBashResult(result: BashExecutionResult): string {
  const lines: string[] = [];

  // Combine stdout and stderr
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  if (output) {
    lines.push(output);
  }

  if (result.truncated) {
    lines.push('(output truncated)');
  }

  return lines.join('\n');
}

/**
 * Formats bash execution for AI context.
 *
 * @param result - The execution result
 * @returns Formatted string for AI context
 */
export function formatBashForContext(result: BashExecutionResult): string {
  const output = formatBashResult(result);

  return `[User executed bash command]
$ ${result.command}

Output:
${output || '(no output)'}

Exit code: ${result.exitCode ?? 'killed'}`;
}
