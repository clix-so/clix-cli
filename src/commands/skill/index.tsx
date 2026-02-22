import type { AgentInfo } from '../../lib/agents';
import { getConfigManager } from '../../lib/config/index';
import { buildAgentHandoffInvocation, runAgentHandoff } from '../../lib/services/agent-handoff';
import { AgentSelectionService } from '../../lib/services/agent-selection-service';
import { getSkillPrompt } from '../../lib/skills';
import { InstallPreparationUI } from '../../ui/components/InstallPreparationUI';
import {
  INSTALL_TASK_LABELS,
  type InstallTaskId,
} from '../../ui/components/install-preparation-tasks';
import { safeRender } from '../../ui/utils/safeRender';
import type { PreparationContext } from './preparation';

interface SkillCommandOptions {
  action?: string;
  platform?: 'ios' | 'android' | 'react-native' | 'flutter';
  startTask?: string;
}

type CommandSkillType = 'install' | 'doctor';

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

async function loadCommandAgent(): Promise<AgentInfo | null> {
  const configManager = getConfigManager();
  const selectionService = new AgentSelectionService(configManager);
  const result = await selectionService.selectAgent({ mode: 'command' });

  if (!result.agent) {
    return null;
  }

  if (result.source === 'auto') {
    await selectionService.saveSelection(result.agent);
  }

  return result.agent;
}

export async function skillCommand(options: SkillCommandOptions): Promise<void> {
  const { action, platform, startTask } = options;

  if (!action || !isCommandSkillType(action)) {
    console.log(generateHelpText());
    return;
  }

  const skillType: CommandSkillType = action;
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

  let preparationContext: PreparationContext | undefined;
  if (skillType === 'install') {
    const context = await runInstallPreparation(projectPath, startTaskId);
    if (!context) {
      return;
    }
    preparationContext = context;
  }

  const agent = await loadCommandAgent();
  if (!agent) {
    throw new Error(
      'No AI agent is available. Install an agent CLI and run "clix agent" to select one.',
    );
  }

  const prompt = await getSkillPrompt(skillType, {
    projectPath,
    platform,
    preparationContext,
  });

  console.log(`Handing off to ${agent.displayName} CLI...`);
  const invocation = buildAgentHandoffInvocation({
    agent,
    prompt,
    workingDirectory: projectPath,
  });

  let exitCode = 1;
  try {
    exitCode = await runAgentHandoff(invocation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to hand off to ${agent.displayName}: ${message}`);
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
