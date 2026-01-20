import { render } from 'ink';
import type { AgentInfo } from '../lib/agents';
import type { AgentExecutor, AgentMessage } from '../lib/executor';
import { getDebugPrompt } from '../lib/services/debug-service';
import { AgentExecutionUI } from '../ui/AgentExecutionUI';
import { printFinalOutput } from '../ui/utils/finalOutput';

interface DebugCommandOptions {
  problem?: string;
}

function createDebugExecute(problemDescription: string) {
  return async function* execute(
    executor: AgentExecutor,
    _agent: AgentInfo,
  ): AsyncGenerator<AgentMessage> {
    const debugPrompt = getDebugPrompt({
      problemDescription,
      projectPath: process.cwd(),
      oneShot: true,
    });

    for await (const message of executor.execute(debugPrompt, {
      workingDirectory: process.cwd(),
      oneShot: true,
    })) {
      yield message;
    }
  };
}

export async function debugCommand(options: DebugCommandOptions): Promise<void> {
  const { problem } = options;

  if (!problem) {
    console.log(`
Usage: clix debug <problem>

Description:
  Interactive debugging assistant that investigates your problem
  and provides root cause analysis with recommended fixes.

Arguments:
  <problem>    Description of the problem you're experiencing

Examples:
  $ clix debug "Push notifications not working on iOS"
  $ clix debug "Events not appearing in Clix dashboard"
  $ clix debug "Gradle build failing with dependency conflict"
`);
    return;
  }

  return new Promise((resolve) => {
    const { unmount } = render(
      <AgentExecutionUI
        title="Debug Assistant"
        description={`Investigating: ${problem}`}
        execute={createDebugExecute(problem)}
        onComplete={(result) => {
          unmount();
          if (result) {
            printFinalOutput(result);
          }
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
