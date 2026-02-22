import { runCommandHandoff } from '../lib/services/agent-handoff';

const DEFAULT_SKILLS_REPOSITORY = 'clix-so/skills';

interface SkillsCommandDependencies {
  runHandoff?: typeof runCommandHandoff;
}

export async function skillsCommand(dependencies: SkillsCommandDependencies = {}): Promise<void> {
  const runHandoff = dependencies.runHandoff ?? runCommandHandoff;

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
    throw new Error(`Failed to launch Skills CLI: ${message}`);
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
