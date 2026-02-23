import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback } from 'react';
import type { AgentInfo } from '../../lib/agents';
import { getConfigManager } from '../../lib/config/index';
import { buildAgentHandoffInvocation, runAgentHandoff } from '../../lib/services/agent-handoff';
import { AgentSelectionService } from '../../lib/services/agent-selection-service';
import { getSkillPrompt } from '../../lib/skills';
import { GenericSelector, type SelectorItem } from '../../ui/components/GenericSelector';
import {
  getStatusLayoutPolicy,
  getStatusRows,
  InstallPreparationUI,
  StatusLine,
} from '../../ui/components/InstallPreparationUI';
import {
  INSTALL_TASK_LABELS,
  type InstallTaskId,
} from '../../ui/components/install-preparation-tasks';
import { safeRender } from '../../ui/utils/safeRender';
import { gatherPreparationContext, type PreparationContext } from './preparation';

interface SkillCommandOptions {
  action?: string;
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
  --start-task               Development-only install task override

Examples:
  $ clix install
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

interface DoctorActionItem extends SelectorItem {
  action: 'diagnose' | 'exit';
}

function DoctorStatusDisplay({
  context,
  onAccept,
  onCancel,
}: {
  context: PreparationContext;
  onAccept?: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const layoutPolicy = getStatusLayoutPolicy();
  const statusRows = getStatusRows(context, layoutPolicy, {}, false);

  const items: DoctorActionItem[] = [
    { id: 'diagnose', label: 'Run AI diagnosis', action: 'diagnose' },
    { id: 'exit', label: 'Exit', action: 'exit' },
  ];

  const handleSelect = useCallback(
    (item: DoctorActionItem) => {
      if (item.action === 'diagnose') {
        onAccept?.();
      } else {
        onCancel();
      }
    },
    [onAccept, onCancel],
  );

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Clix SDK Doctor — Pre-check Status</Text>
      <Box marginY={1} flexDirection="column">
        {statusRows.map((row) => (
          <StatusLine key={row.label} label={row.label} status={row.status} detail={row.detail} />
        ))}
      </Box>

      {!context.ready && (
        <>
          <Box marginBottom={1} flexDirection="column">
            <Text color="yellow">Missing setup:</Text>
            {context.missing.map((item) => (
              <Text key={item} color="gray">
                {'  '}• {item}
              </Text>
            ))}
          </Box>
          <Text>
            Run "<Text color="cyan">clix install</Text>" to complete the required setup before
            running doctor.
          </Text>
        </>
      )}

      {context.ready && onAccept && (
        <>
          <Text color="gray">
            Additional SDK integration issues can be diagnosed with an AI agent.
          </Text>
          <GenericSelector items={items} title="" onSelect={handleSelect} onCancel={onCancel} />
        </>
      )}
    </Box>
  );
}

async function runDoctorPrecheck(context: PreparationContext): Promise<'accepted' | 'cancelled'> {
  return new Promise((resolve) => {
    const { unmount } = safeRender(
      <DoctorStatusDisplay
        context={context}
        onAccept={
          context.ready
            ? () => {
                unmount();
                resolve('accepted');
              }
            : undefined
        }
        onCancel={() => {
          unmount();
          resolve('cancelled');
        }}
      />,
    );

    if (!context.ready) {
      setTimeout(() => {
        unmount();
        resolve('cancelled');
      }, 0);
    }
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
  const { action, startTask } = options;

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
  } else if (skillType === 'doctor') {
    const context = await gatherPreparationContext(projectPath);
    if (!context) {
      console.error('Project not linked. Run "clix login" first.');
      process.exit(1);
    }
    const result = await runDoctorPrecheck(context);
    if (result === 'cancelled') {
      process.exit(context.ready ? 0 : 1);
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
    preparationContext,
  });

  console.log(`Launching ${agent.displayName}...`);
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
    throw new Error(`Failed to launch ${agent.displayName}: ${message}`);
  }

  process.exit(exitCode);
}
