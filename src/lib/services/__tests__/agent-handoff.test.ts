import { beforeEach, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { AgentInfo } from '@/lib/agents';
import type {
  AgentHandoffInvocation,
  CommandHandoffInvocation,
  HandoffProcess,
  HandoffSpawner,
  HandoffSpawnOptions,
} from '../agent-handoff';
import { buildAgentHandoffInvocation, runAgentHandoff, runCommandHandoff } from '../agent-handoff';

class FakeHandoffProcess extends EventEmitter implements HandoffProcess {
  override on(event: 'error', listener: (error: Error) => void): this;
  override on(event: 'spawn', listener: () => void): this;
  override on(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  override on(
    event: 'error' | 'spawn' | 'close',
    listener:
      | ((error: Error) => void)
      | (() => void)
      | ((code: number | null, signal: NodeJS.Signals | null) => void),
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}

const BASE_AGENT: Omit<AgentInfo, 'name' | 'command' | 'displayName'> = {
  description: 'test agent',
  installUrl: 'https://example.com',
  sdkPackage: 'test-package',
};

function createAgent(name: AgentInfo['name'], command: string, displayName: string): AgentInfo {
  return {
    ...BASE_AGENT,
    name,
    command,
    displayName,
  };
}

describe('buildAgentHandoffInvocation', () => {
  test('builds claude invocation with persistent interactive flags', () => {
    const invocation = buildAgentHandoffInvocation({
      agent: createAgent('claude', 'claude', 'Claude'),
      prompt: 'install prompt',
      workingDirectory: '/tmp/project',
    });

    expect(invocation.command).toBe('claude');
    expect(invocation.args).not.toContain('-p');
    expect(invocation.args).not.toContain('--no-session-persistence');
    expect(invocation.args).toContain('--dangerously-skip-permissions');
    expect(invocation.args).toContain('--permission-mode');
    expect(invocation.args).toContain('bypassPermissions');
  });

  test('builds codex invocation with persistent interactive flags', () => {
    const invocation = buildAgentHandoffInvocation({
      agent: createAgent('codex', 'codex', 'Codex'),
      prompt: 'install prompt',
      workingDirectory: '/tmp/project',
    });

    expect(invocation.args).not.toContain('exec');
    expect(invocation.args).not.toContain('--skip-git-repo-check');
    expect(invocation.args).toContain('install prompt');
    expect(invocation.args).toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  test('builds cursor invocation with workspace argument', () => {
    const invocation = buildAgentHandoffInvocation({
      agent: createAgent('cursor', 'agent', 'Cursor'),
      prompt: 'install prompt',
      workingDirectory: '/tmp/project',
    });

    expect(invocation.args).not.toContain('-p');
    expect(invocation.args[0]).toBe('install prompt');
    expect(invocation.args).toContain('--workspace');
    expect(invocation.args).toContain('/tmp/project');
  });

  test('injects OPENCODE_PERMISSION by default for opencode', () => {
    const previous = process.env.OPENCODE_PERMISSION;
    process.env.OPENCODE_PERMISSION = '';
    process.env.OPENCODE_PERMISSION = undefined;

    const invocation = buildAgentHandoffInvocation({
      agent: createAgent('opencode', 'opencode', 'OpenCode'),
      prompt: 'install prompt',
      workingDirectory: '/tmp/project',
    });

    expect(invocation.env?.OPENCODE_PERMISSION).toBe('{"*":"allow"}');

    if (previous !== undefined) {
      process.env.OPENCODE_PERMISSION = previous;
    } else {
      process.env.OPENCODE_PERMISSION = undefined;
    }
  });

  test('does not override OPENCODE_PERMISSION when already set', () => {
    const previous = process.env.OPENCODE_PERMISSION;
    process.env.OPENCODE_PERMISSION = '{"*":"deny"}';

    const invocation = buildAgentHandoffInvocation({
      agent: createAgent('opencode', 'opencode', 'OpenCode'),
      prompt: 'install prompt',
      workingDirectory: '/tmp/project',
    });

    expect(invocation.env).toBeUndefined();

    if (previous !== undefined) {
      process.env.OPENCODE_PERMISSION = previous;
    } else {
      process.env.OPENCODE_PERMISSION = undefined;
    }
  });
});

describe('runAgentHandoff', () => {
  let invocation: AgentHandoffInvocation;

  beforeEach(() => {
    invocation = {
      agent: createAgent('codex', 'codex', 'Codex'),
      command: 'codex',
      args: ['prompt'],
      workingDirectory: '/tmp/project',
    };
  });

  test('resolves after process close with exit code', async () => {
    const process = new FakeHandoffProcess();
    const spawnProcess: HandoffSpawner = (_command, _args, _options) => {
      queueMicrotask(() => {
        process.emit('spawn');
        process.emit('close', 0, null);
      });
      return process;
    };

    const exitCode = await runAgentHandoff(invocation, spawnProcess);
    expect(exitCode).toBe(0);
  });

  test('maps signal exit to conventional exit code', async () => {
    const process = new FakeHandoffProcess();
    const spawnProcess: HandoffSpawner = (_command, _args, _options) => {
      queueMicrotask(() => {
        process.emit('spawn');
        process.emit('close', null, 'SIGTERM');
      });
      return process;
    };

    const exitCode = await runAgentHandoff(invocation, spawnProcess);
    expect(exitCode).toBe(143);
  });

  test('passes expected spawn arguments and options', async () => {
    const process = new FakeHandoffProcess();
    let capturedCommand: string | undefined;
    let capturedArgs: string[] | undefined;
    let capturedOptions: HandoffSpawnOptions | undefined;

    const invocationWithEnv: AgentHandoffInvocation = {
      ...invocation,
      env: {
        TEST_ENV: '1',
      },
    };

    const spawnProcess: HandoffSpawner = (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedOptions = options;
      queueMicrotask(() => {
        process.emit('spawn');
        process.emit('close', 0, null);
      });
      return process;
    };

    const exitCode = await runAgentHandoff(invocationWithEnv, spawnProcess);
    expect(exitCode).toBe(0);
    expect(capturedCommand).toBe('codex');
    expect(capturedArgs).toEqual(['prompt']);
    expect(capturedOptions).toEqual({
      cwd: '/tmp/project',
      stdio: 'inherit',
      shell: false,
      env: {
        TEST_ENV: '1',
      },
    });
  });

  test('throws when process emits spawn error', async () => {
    const process = new FakeHandoffProcess();
    const spawnProcess: HandoffSpawner = (_command, _args, _options) => {
      queueMicrotask(() => {
        process.emit('error', new Error('spawn ENOENT'));
      });
      return process;
    };

    await expect(runAgentHandoff(invocation, spawnProcess)).rejects.toThrow(
      'Failed to start Codex',
    );
  });

  test('throws when spawner throws synchronously', async () => {
    const spawnProcess: HandoffSpawner = () => {
      throw new Error('spawn ENOENT');
    };

    await expect(runAgentHandoff(invocation, spawnProcess)).rejects.toThrow(
      'Failed to start Codex',
    );
  });
});

describe('runCommandHandoff', () => {
  test('runs command handoff with inherited stdio', async () => {
    const process = new FakeHandoffProcess();
    let capturedCommand: string | undefined;
    let capturedArgs: string[] | undefined;
    let capturedOptions: HandoffSpawnOptions | undefined;

    const invocation: CommandHandoffInvocation = {
      command: 'npx',
      args: ['skills', 'add', 'clix-so/skills'],
      workingDirectory: '/tmp/project',
      env: { TEST_ENV: '1' },
      displayName: 'Skills CLI',
    };

    const spawnProcess: HandoffSpawner = (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedOptions = options;
      queueMicrotask(() => {
        process.emit('spawn');
        process.emit('close', 0, null);
      });
      return process;
    };

    const exitCode = await runCommandHandoff(invocation, spawnProcess);
    expect(exitCode).toBe(0);
    expect(capturedCommand).toBe('npx');
    expect(capturedArgs).toEqual(['skills', 'add', 'clix-so/skills']);
    expect(capturedOptions).toEqual({
      cwd: '/tmp/project',
      stdio: 'inherit',
      shell: false,
      env: { TEST_ENV: '1' },
    });
  });

  test('uses command name in error message when display name is omitted', async () => {
    const process = new FakeHandoffProcess();
    const invocation: CommandHandoffInvocation = {
      command: 'npx',
      args: ['skills', 'add', 'clix-so/skills'],
      workingDirectory: '/tmp/project',
    };

    const spawnProcess: HandoffSpawner = () => {
      queueMicrotask(() => {
        process.emit('error', new Error('spawn ENOENT'));
      });
      return process;
    };

    await expect(runCommandHandoff(invocation, spawnProcess)).rejects.toThrow(
      'Failed to start npx',
    );
  });
});
