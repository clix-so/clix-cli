import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type {
  MCPInstallProcess,
  MCPInstallSpawner,
  MCPInstallSpawnOptions,
  MCPTargetAgent,
} from '../mcp-install-service';
import {
  getMCPAgentDisplayName,
  getValidMCPAgents,
  installMCPServer,
  isValidMCPAgent,
} from '../mcp-install-service';

class FakeInstallProcess extends EventEmitter implements MCPInstallProcess {
  stdout = new PassThrough();
  stderr = new PassThrough();

  override on(event: 'close', listener: (code: number | null) => void): this;
  override on(event: 'error', listener: (error: Error) => void): this;
  override on(
    event: 'close' | 'error',
    listener: ((code: number | null) => void) | ((error: Error) => void),
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}

describe('getMCPAgentDisplayName', () => {
  test('returns display name for known agent', () => {
    expect(getMCPAgentDisplayName('claude')).toBe('Claude');
    expect(getMCPAgentDisplayName('codex')).toBe('Codex');
  });

  test('returns agent name for unknown agent', () => {
    expect(getMCPAgentDisplayName('unknown' as unknown as MCPTargetAgent)).toBe('unknown');
  });
});

describe('mcp agent validation', () => {
  test('exposes valid MCP agent names', () => {
    expect(getValidMCPAgents()).toEqual([
      'claude',
      'codex',
      'gemini',
      'opencode',
      'cursor',
      'copilot',
    ]);
  });

  test('validates MCP target agent', () => {
    expect(isValidMCPAgent('codex')).toBe(true);
    expect(isValidMCPAgent('unknown')).toBe(false);
  });
});

describe('installMCPServer', () => {
  test('returns unknown agent error when agent is unsupported', async () => {
    const result = await installMCPServer('unknown' as unknown as MCPTargetAgent);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown agent');
  });

  test('runs add-mcp command with expected arguments', async () => {
    const fakeProcess = new FakeInstallProcess();
    let capturedCommand: string | undefined;
    let capturedArgs: string[] | undefined;
    let capturedOptions: MCPInstallSpawnOptions | undefined;

    const spawner: MCPInstallSpawner = (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedOptions = options;
      queueMicrotask(() => {
        fakeProcess.emit('close', 0);
      });
      return fakeProcess;
    };

    const result = await installMCPServer('codex', spawner);

    expect(result.success).toBe(true);
    expect(capturedCommand).toBe('npx');
    expect(capturedArgs).toBeDefined();
    expect(capturedArgs).toContain('add-mcp');
    expect(capturedArgs).toContain('npx -y https://github.com/clix-so/clix-mcp-server');
    expect(capturedArgs).toContain('--name');
    expect(capturedArgs).toContain('clix-mcp-server');
    expect(capturedArgs).toContain('--agent');
    expect(capturedArgs).toContain('codex');
    expect(capturedArgs).toContain('--global');
    expect(capturedArgs).toContain('--yes');
    expect(capturedOptions).toMatchObject({
      stdio: 'pipe',
      shell: false,
      cwd: process.cwd(),
    });
  });

  test('uses github-copilot-cli add-mcp agent id for copilot', async () => {
    const fakeProcess = new FakeInstallProcess();
    let capturedArgs: string[] | undefined;

    const spawner: MCPInstallSpawner = (_command, args, _options) => {
      capturedArgs = args;
      queueMicrotask(() => {
        fakeProcess.emit('close', 0);
      });
      return fakeProcess;
    };

    const result = await installMCPServer('copilot', spawner);

    expect(result.success).toBe(true);
    expect(capturedArgs).toContain('github-copilot-cli');
  });

  test('returns failure with stderr when command exits non-zero', async () => {
    const fakeProcess = new FakeInstallProcess();

    const spawner: MCPInstallSpawner = () => {
      queueMicrotask(() => {
        fakeProcess.stderr.write('permission denied');
        fakeProcess.emit('close', 1);
      });
      return fakeProcess;
    };

    const result = await installMCPServer('claude', spawner);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to install Clix MCP Server');
    expect(result.error).toContain('permission denied');
  });

  test('treats already-configured output as success', async () => {
    const fakeProcess = new FakeInstallProcess();

    const spawner: MCPInstallSpawner = () => {
      queueMicrotask(() => {
        fakeProcess.stderr.write('server already exists in config');
        fakeProcess.emit('close', 1);
      });
      return fakeProcess;
    };

    const result = await installMCPServer('cursor', spawner);

    expect(result.success).toBe(true);
    expect(result.message).toContain('already configured');
  });

  test('returns failure when spawn throws synchronously', async () => {
    const spawner: MCPInstallSpawner = () => {
      throw new Error('spawn ENOENT');
    };

    const result = await installMCPServer('gemini', spawner);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to run add-mcp');
    expect(result.error).toContain('spawn ENOENT');
  });

  test('returns failure when process emits error event', async () => {
    const fakeProcess = new FakeInstallProcess();

    const spawner: MCPInstallSpawner = () => {
      queueMicrotask(() => {
        fakeProcess.emit('error', new Error('spawn ENOENT'));
      });
      return fakeProcess;
    };

    const result = await installMCPServer('opencode', spawner);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to run add-mcp');
    expect(result.error).toContain('spawn ENOENT');
  });
});
