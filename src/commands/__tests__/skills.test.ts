import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { CommandHandoffInvocation } from '@/lib/services/agent-handoff';

const runCommandHandoffMock = mock(async (_invocation: CommandHandoffInvocation) => 0);
const exitProcessMock = mock((_code: number) => {});

import { skillsCommand } from '../skills';

describe('skillsCommand', () => {
  beforeEach(() => {
    runCommandHandoffMock.mockReset();
    runCommandHandoffMock.mockResolvedValue(0);
    exitProcessMock.mockReset();
  });

  test('hands off to npx skills add clix-so/skills', async () => {
    await skillsCommand({ runHandoff: runCommandHandoffMock, exitProcess: exitProcessMock });

    expect(runCommandHandoffMock).toHaveBeenCalledTimes(1);
    expect(runCommandHandoffMock).toHaveBeenCalledWith({
      command: 'npx',
      args: ['skills', 'add', 'clix-so/skills'],
      workingDirectory: process.cwd(),
      displayName: 'Skills CLI',
    });
    expect(exitProcessMock).toHaveBeenCalledTimes(1);
    expect(exitProcessMock).toHaveBeenCalledWith(0);
  });
});
