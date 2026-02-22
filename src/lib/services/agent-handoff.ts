import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import type { AgentInfo } from '@/lib/agents';

type ProcessWithOptionalExecve = NodeJS.Process & {
  execve?: (file: string, args: string[], env?: NodeJS.ProcessEnv) => never;
};

export interface AgentHandoffInvocation {
  agent: AgentInfo;
  command: string;
  args: string[];
  workingDirectory: string;
  env?: NodeJS.ProcessEnv;
}

export interface CommandHandoffInvocation {
  command: string;
  args: string[];
  workingDirectory: string;
  env?: NodeJS.ProcessEnv;
  displayName?: string;
}

interface BuildAgentHandoffInvocationOptions {
  agent: AgentInfo;
  prompt: string;
  workingDirectory: string;
}

export interface HandoffProcess {
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'spawn', listener: () => void): this;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export interface HandoffSpawnOptions {
  cwd: string;
  stdio: 'inherit';
  shell: false;
  env?: NodeJS.ProcessEnv;
}

export type HandoffSpawner = (
  command: string,
  args: string[],
  options: HandoffSpawnOptions,
) => HandoffProcess;

interface HandoffExecutionInvocation {
  command: string;
  args: string[];
  workingDirectory: string;
  env?: NodeJS.ProcessEnv;
  displayName: string;
}

function createDefaultOpenCodeEnv(): NodeJS.ProcessEnv | undefined {
  if (process.env.OPENCODE_PERMISSION) {
    return undefined;
  }

  return {
    ...process.env,
    OPENCODE_PERMISSION: '{"*":"allow"}',
  };
}

export function buildAgentHandoffInvocation({
  agent,
  prompt,
  workingDirectory,
}: BuildAgentHandoffInvocationOptions): AgentHandoffInvocation {
  switch (agent.name) {
    case 'claude':
      return {
        agent,
        command: agent.command,
        args: ['--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions', prompt],
        workingDirectory,
      };

    case 'codex':
      return {
        agent,
        command: agent.command,
        args: ['--dangerously-bypass-approvals-and-sandbox', prompt],
        workingDirectory,
      };

    case 'gemini':
      return {
        agent,
        command: agent.command,
        args: [prompt, '-m', 'gemini-3-flash-preview', '-y'],
        workingDirectory,
      };

    case 'opencode':
      return {
        agent,
        command: agent.command,
        args: [prompt],
        workingDirectory,
        env: createDefaultOpenCodeEnv(),
      };

    case 'cursor':
      return {
        agent,
        command: agent.command,
        args: [prompt, '-f', '--approve-mcps', '--workspace', workingDirectory],
        workingDirectory,
      };

    case 'copilot':
      return {
        agent,
        command: agent.command,
        args: [prompt, '--allow-all-tools'],
        workingDirectory,
      };

    default:
      throw new Error(`Unsupported agent for handoff: ${agent.name}`);
  }
}

const defaultSpawner: HandoffSpawner = (command, args, options) => spawn(command, args, options);

function getExecve(): ((file: string, args: string[], env?: NodeJS.ProcessEnv) => never) | null {
  const processWithExecve = process as ProcessWithOptionalExecve;
  if (typeof processWithExecve.execve !== 'function') {
    return null;
  }

  return processWithExecve.execve.bind(processWithExecve);
}

function resolveExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (typeof code === 'number') {
    return code;
  }

  if (signal) {
    const signalCode = osConstants.signals[signal];
    if (typeof signalCode === 'number') {
      return 128 + signalCode;
    }
    return 1;
  }

  return 1;
}

export async function runAgentHandoff(
  invocation: AgentHandoffInvocation,
  spawnProcess: HandoffSpawner = defaultSpawner,
): Promise<number> {
  return await runHandoffInvocation(
    {
      command: invocation.command,
      args: invocation.args,
      workingDirectory: invocation.workingDirectory,
      env: invocation.env,
      displayName: invocation.agent.displayName,
    },
    spawnProcess,
  );
}

export async function runCommandHandoff(
  invocation: CommandHandoffInvocation,
  spawnProcess: HandoffSpawner = defaultSpawner,
): Promise<number> {
  return await runHandoffInvocation(
    {
      command: invocation.command,
      args: invocation.args,
      workingDirectory: invocation.workingDirectory,
      env: invocation.env,
      displayName: invocation.displayName ?? invocation.command,
    },
    spawnProcess,
  );
}

async function runHandoffInvocation(
  invocation: HandoffExecutionInvocation,
  spawnProcess: HandoffSpawner,
): Promise<number> {
  const execve = getExecve();
  if (execve) {
    execve(invocation.command, [invocation.command, ...invocation.args], invocation.env);
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let child: HandoffProcess;

    const rejectWithSpawnError = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`Failed to start ${invocation.displayName}: ${error.message}`));
    };

    try {
      child = spawnProcess(invocation.command, invocation.args, {
        cwd: invocation.workingDirectory,
        stdio: 'inherit',
        shell: false,
        env: invocation.env,
      });
    } catch (error) {
      rejectWithSpawnError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    child.on('error', rejectWithSpawnError);
    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(resolveExitCode(code, signal));
    });
  });
}
