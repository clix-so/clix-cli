import { AgentError } from '../lib/errors';
import { runCommandHandoff } from '../lib/services/agent-handoff';

const DEFAULT_SKILLS_REPOSITORY = 'clix-so/skills';

interface SkillsCommandDependencies {
  runHandoff?: typeof runCommandHandoff;
  exitProcess?: (code: number) => void;
}

export async function skillsCommand(dependencies: SkillsCommandDependencies = {}): Promise<void> {
  const runHandoff = dependencies.runHandoff ?? runCommandHandoff;
  const exitProcess = dependencies.exitProcess ?? ((code: number) => process.exit(code));

  console.log('Adding Clix Skills...');

  let exitCode = 1;
  try {
    exitCode = await runHandoff({
      command: 'npx',
      args: ['skills', 'add', DEFAULT_SKILLS_REPOSITORY],
      workingDirectory: process.cwd(),
      displayName: 'Skills CLI',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentError(`Failed to launch Skills CLI: ${message}`, 'Skills CLI');
  }

  exitProcess(exitCode);
}
