import type { AgentInfo } from '../../lib/agents';
import type { AgentExecutor, AgentMessage } from '../../lib/executor';
import { ensureVercelSkillsInstalled } from '../../lib/services/vercel-skills';
import { executeSkill } from '../../lib/skills';
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

type CommandSkillType = 'install' | 'doctor';

const COMMAND_SKILLS: Record<
  CommandSkillType,
  {
    title: string;
    description: string;
  }
> = {
  install: {
    title: 'SDK Installation',
    description: 'Autonomous SDK integration with automatic file modifications',
  },
  doctor: {
    title: 'SDK Doctor',
    description: 'Check Clix SDK integration status',
  },
};

function isCommandSkillType(action: string): action is CommandSkillType {
  return action === 'install' || action === 'doctor';
}

function generateHelpText(): string {
  return `
Usage: clix <command> [options]

Supported commands:
  install                    Autonomous SDK integration with step-by-step preparation
  doctor                     Check Clix SDK integration status

Options:
  --platform                 Target platform (ios, android, react-native, flutter)
  --start-task               Development-only install task override

Examples:
  $ clix install
  $ clix install --platform ios
  $ clix doctor
`;
}

async function runInstallPreparation(
  projectPath: string,
  startTaskId?: InstallTaskId,
): Promise<PreparationContext | null> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <InstallPreparationUI
        projectPath={projectPath}
        startTaskId={startTaskId}
        mode="command-prep-only"
        onRunInstallSkill={async () => ({
          success: false,
          error: 'install_skill is disabled in command preparation mode.',
        })}
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

async function ensureSkillsReady(agent: AgentInfo, commandName: string): Promise<void> {
  const ready = await ensureVercelSkillsInstalled(agent, commandName, process.cwd());
  if (!ready) {
    throw new Error('Required Vercel Skills are not installed.');
  }
}

export async function skillCommand(options: SkillCommandOptions): Promise<void> {
  const { action, platform, startTask } = options;

  if (!action || !isCommandSkillType(action)) {
    console.log(generateHelpText());
    return;
  }

  const skillType: CommandSkillType = action;
  const projectPath = process.cwd();
  const commandInfo = COMMAND_SKILLS[skillType];
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

  let preparationContext: PreparationContext | undefined;
  if (skillType === 'install') {
    const context = await runInstallPreparation(projectPath, startTaskId);
    if (!context) {
      return;
    }
    preparationContext = context;
  }

  async function prepare(agent: AgentInfo): Promise<void> {
    await ensureSkillsReady(agent, `clix ${skillType}`);
  }

  async function* executeCommand(executor: AgentExecutor): AsyncGenerator<AgentMessage> {
    yield* executeSkill(skillType, executor, {
      projectPath,
      platform,
      oneShot: true,
      preparationContext,
    });
  }

  async function* execute(
    executor: AgentExecutor,
    _agent: AgentInfo,
  ): AsyncGenerator<AgentMessage> {
    yield* executeCommand(executor);
  }

  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <AgentExecutionUI
        title={commandInfo.title}
        description={commandInfo.description}
        prepare={prepare}
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
