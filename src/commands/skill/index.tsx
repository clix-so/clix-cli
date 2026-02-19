import type { AgentExecutor, AgentMessage } from '../../lib/executor';
import {
  executeSkill,
  getAvailableSkills,
  getAvailableSkillTypes,
  getSkillInfo,
  type SkillType,
} from '../../lib/skills';
import { AgentExecutionUI } from '../../ui/AgentExecutionUI';
import { InstallPreparationUI } from '../../ui/components/InstallPreparationUI';
import {
  INSTALL_TASK_LABELS,
  type InstallTaskId,
} from '../../ui/components/install-preparation-tasks';
import { printFinalOutput } from '../../ui/utils/finalOutput';
import { safeRender } from '../../ui/utils/safeRender';
import type { PreparationContext } from './preparation';

interface SkillCommandOptions {
  action?: string;
  platform?: 'ios' | 'android' | 'react-native' | 'flutter';
  startTask?: string;
}

/**
 * Generate help text dynamically from available skills.
 */
function generateHelpText(): string {
  const skills = getAvailableSkills();
  const localSkills = skills.filter((s) => s.isLocal);
  const packageSkills = skills.filter((s) => !s.isLocal);

  const localSkillsText = localSkills
    .map((s) => `  ${s.type.padEnd(25)} ${s.description}`)
    .join('\n');

  const packageSkillsText = packageSkills
    .map((s) => `  ${s.type.padEnd(25)} ${s.description} (interactive)`)
    .join('\n');

  const exampleSkill = localSkills[0]?.type ?? 'install';

  return `
Usage: clix <skill> [options]

Available skills (command-line mode):
${localSkillsText}

Additional skills (chat mode only):
${packageSkillsText}

Options:
  --platform      Target platform (ios, android, react-native, flutter)

Note: Interactive skills require step-by-step guidance.
      Run 'clix' to start chat mode and use /<skill> commands.

Examples:
  $ clix ${exampleSkill}
  $ clix doctor
`;
}

/**
 * Run install preparation UI and return the context.
 */
async function runInstallPreparation(
  projectPath: string,
  startTaskId?: InstallTaskId,
): Promise<PreparationContext | null> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <InstallPreparationUI
        projectPath={projectPath}
        startTaskId={startTaskId}
        onComplete={(context) => {
          unmount();
          resolve(context);
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />,
    );
  });
}

export async function skillCommand(options: SkillCommandOptions): Promise<void> {
  const { action, platform, startTask } = options;

  if (!action || !isValidSkillType(action)) {
    console.log(generateHelpText());
    return;
  }

  // Check if skill supports command-line execution
  const skillInfo = getSkillInfo(action as SkillType);
  if (!skillInfo) {
    console.error(`Skill not found: ${action}`);
    process.exit(1);
  }

  if (!skillInfo.isLocal) {
    console.error(`Skill '${action}' requires interactive mode.`);
    console.error(`Please run 'clix' to start chat mode and use /${action}`);
    process.exit(1);
  }

  // Check if skill uses direct implementation (not agent-based)
  if (skillInfo.usesAgent === false) {
    console.error(`Skill '${action}' uses direct implementation.`);
    console.error(`Please run 'clix ${action}' directly instead.`);
    process.exit(1);
  }

  const skillType = action as SkillType;
  const projectPath = process.cwd();
  let startTaskId: InstallTaskId | undefined;

  if (startTask) {
    const installTaskIds = Object.keys(INSTALL_TASK_LABELS) as InstallTaskId[];
    if (!installTaskIds.includes(startTask as InstallTaskId)) {
      console.error(`Invalid --start-task value: ${startTask}`);
      console.error(`Allowed values: ${installTaskIds.join(', ')}`);
      process.exit(1);
    }

    if (skillType !== 'install') {
      console.error('--start-task is only supported with the install command.');
      process.exit(1);
    }

    if (process.env.CLIX_DEV_ENABLE_TASK_OVERRIDE !== '1') {
      console.error('--start-task is a development-only option.');
      console.error('Set CLIX_DEV_ENABLE_TASK_OVERRIDE=1 to enable task override.');
      process.exit(1);
    }

    startTaskId = startTask as InstallTaskId;
  }

  // For install skill, run preparation first
  let preparationContext: PreparationContext | undefined;
  if (skillType === 'install') {
    const context = await runInstallPreparation(projectPath, startTaskId);
    if (!context) {
      // User cancelled or config missing
      return;
    }
    preparationContext = context;
  }

  // Create execute function that wraps executeSkill
  async function* executeCommand(executor: AgentExecutor): AsyncGenerator<AgentMessage> {
    yield* executeSkill(skillType, executor, {
      projectPath,
      platform,
      oneShot: true,
      preparationContext,
    });
  }

  // Wrapper to match AgentExecutionUI interface (ignores agent param)
  async function* execute(executor: AgentExecutor, _agent: unknown): AsyncGenerator<AgentMessage> {
    yield* executeCommand(executor);
  }

  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <AgentExecutionUI
        title={skillInfo.name}
        description={skillInfo.description}
        execute={execute}
        onComplete={(result) => {
          unmount();
          if (result) {
            printFinalOutput(result);
          }
          resolve();
        }}
      />,
    );
  });
}

function isValidSkillType(action: string): action is SkillType {
  return getAvailableSkillTypes().includes(action);
}
