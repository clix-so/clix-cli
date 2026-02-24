import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { CommandHandoffInvocation } from '@/lib/services/agent-handoff';

const runCommandHandoffMock = mock(async (_invocation: CommandHandoffInvocation) => 0);
const exitProcessMock = mock((_code: number) => {});

import { mcpCommand } from '../mcp';

describe('mcpCommand', () => {
  beforeEach(() => {
    runCommandHandoffMock.mockReset();
    runCommandHandoffMock.mockResolvedValue(0);
    exitProcessMock.mockReset();
  });

  test('hands off with fixed add-mcp arguments', async () => {
    await mcpCommand({ runHandoff: runCommandHandoffMock, exitProcess: exitProcessMock });

    expect(runCommandHandoffMock).toHaveBeenCalledTimes(1);
    const invocation = runCommandHandoffMock.mock.calls[0]?.[0];

    expect(invocation).toBeDefined();
    if (!invocation) {
      return;
    }

    expect(invocation.command).toBe('npx');
    expect(invocation.displayName).toBe('add-mcp');
    expect(invocation.args).toEqual([
      'add-mcp',
      '@clix-so/clix-mcp-server@latest',
      '--name',
      'clix',
    ]);
    expect(exitProcessMock).toHaveBeenCalledTimes(1);
    expect(exitProcessMock).toHaveBeenCalledWith(0);
  });
});
