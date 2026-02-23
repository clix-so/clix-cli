/**
 * CLI Process Manager
 * Shared utilities for spawning CLI processes and parsing JSONL streams
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { registerSyncCleanup, unregisterCleanup } from '../cleanup/cleanup-registry';

export interface CLIProcessOptions {
  command: string;
  args: string[];
  workingDirectory?: string;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

export interface CLIProcessResult {
  process: ChildProcess;
  stdout: Readable;
  stderr: Readable;
  kill: () => void;
}

/**
 * Check if a CLI command is available in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Parse JSONL stream from CLI stdout.
 * Yields parsed JSON objects for each valid line.
 * Invalid JSON lines are silently skipped.
 */
export async function* parseJSONLStream(stream: Readable): AsyncGenerator<unknown> {
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      yield JSON.parse(trimmed);
    } catch {}
  }
}

/**
 * Parse text line stream from CLI stdout.
 * Yields each line of text as a string.
 * Empty lines are preserved.
 */
export async function* parseTextLineStream(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    yield line;
  }
}

/**
 * Spawn a CLI process with proper lifecycle management.
 * Registers cleanup handler to kill process on exit.
 * Supports abort signal for cancellation.
 */
export function spawnCLIProcess(options: CLIProcessOptions): CLIProcessResult {
  const { command, args, workingDirectory, signal, env } = options;

  const proc = spawn(command, args, {
    cwd: workingDirectory,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: env ? { ...process.env, ...env } : process.env,
  });

  // Close stdin immediately - CLI tools like claude/codex need EOF on stdin to start processing
  proc.stdin?.end();

  // Register cleanup to kill process on exit
  const cleanupId = registerSyncCleanup(() => {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  }, 100);

  // Handle abort signal
  const abortHandler = () => {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  };

  signal?.addEventListener('abort', abortHandler);

  const kill = () => {
    signal?.removeEventListener('abort', abortHandler);
    unregisterCleanup(cleanupId);
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  };

  // Clean up when process exits
  proc.on('exit', () => {
    signal?.removeEventListener('abort', abortHandler);
    unregisterCleanup(cleanupId);
  });

  return {
    process: proc,
    stdout: proc.stdout as Readable,
    stderr: proc.stderr as Readable,
    kill,
  };
}

/**
 * Wait for a process to exit and handle errors.
 * Returns a promise that resolves when the process exits successfully,
 * or rejects with an error if the process fails.
 */
export function waitForProcessExit(proc: ChildProcess, stderr: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderrContent = '';

    stderr.on('data', (data: Buffer) => {
      stderrContent += data.toString();
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(stderrContent.trim() || `Process exited with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
