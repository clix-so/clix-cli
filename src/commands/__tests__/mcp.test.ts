import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { CommandHandoffInvocation } from '@/lib/services/agent-handoff';

const runCommandHandoffMock = mock(async (_invocation: CommandHandoffInvocation) => 0);

import { mcpCommand } from '../mcp';

describe('mcpCommand', () => {
  beforeEach(() => {
    runCommandHandoffMock.mockReset();
    runCommandHandoffMock.mockResolvedValue(0);
  });

  test('hands off with mapped add-mcp agent when agent is provided', async () => {
    await mcpCommand({ agent: 'codex' }, { runHandoff: runCommandHandoffMock });

    expect(runCommandHandoffMock).toHaveBeenCalledTimes(1);
    expect(runCommandHandoffMock).toHaveBeenCalledWith({
      command: 'npx',
      args: [
        '-y',
        'add-mcp',
        'npx -y https://github.com/clix-so/clix-mcp-server',
        '--name',
        'clix-mcp-server',
        '--global',
        '--agent',
        'codex',
      ],
      workingDirectory: process.cwd(),
      displayName: 'add-mcp',
    });
  });

  test('hands off without --agent when agent is omitted', async () => {
    await mcpCommand({}, { runHandoff: runCommandHandoffMock });

    expect(runCommandHandoffMock).toHaveBeenCalledTimes(1);
    const invocation = runCommandHandoffMock.mock.calls[0]?.[0];

    expect(invocation).toBeDefined();
    if (!invocation) {
      return;
    }

    expect(invocation.command).toBe('npx');
    expect(invocation.displayName).toBe('add-mcp');
    expect(invocation.args).toEqual([
      '-y',
      'add-mcp',
      'npx -y https://github.com/clix-so/clix-mcp-server',
      '--name',
      'clix-mcp-server',
      '--global',
    ]);
  });
});
