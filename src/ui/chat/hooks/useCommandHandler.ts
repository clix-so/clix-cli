/**
 * Command handler hook for processing slash commands.
 *
 * Uses the command registry pattern for extensibility and maintainability.
 */
import { useApp } from 'ink';
import { useCallback } from 'react';
import { generateHelpText, getCommand, getCommands } from '../../../lib/commands';
import { getAvailableSkillTypes, type SkillType } from '../../../lib/skills';
import { parseBashCommand } from './useBashExecution';
import type { useChatActions } from './useChatActions';
import type { useOverlays } from './useOverlays';

/**
 * Handle the /update command - directs user to CLI for actual update.
 */
function handleUpdateCommand(addSystemMessage: (msg: string) => void): void {
  addSystemMessage(
    'To update Clix CLI, run `clix update` from the terminal.\n\n' +
      'Available options:\n' +
      '  --dry-run  Preview update without executing\n' +
      '  --force    Skip confirmation prompt',
  );
}

interface UseCommandHandlerOptions {
  onExit: () => void;
  onTransferWithAgent: (agent: string) => Promise<void>;
  chatActions: Pick<
    ReturnType<typeof useChatActions>,
    | 'sendMessage'
    | 'addSystemMessage'
    | 'clearMessages'
    | 'compactHistory'
    | 'executeSkill'
    | 'executeBashCommand'
    | 'parseSlashCommand'
    | 'switchAgent'
    | 'resumeSession'
  >;
  overlays: Pick<
    ReturnType<typeof useOverlays>,
    | 'showAgentSelector'
    | 'showTransferSelector'
    | 'showResumeSelector'
    | 'showMCPInstallSelector'
    | 'showDebugPrompt'
    | 'showFirebaseWizard'
  >;
}

/**
 * Get skill command names that trigger skill execution.
 * Dynamically generated from available skill types.
 */
function getSkillCommands(): Set<string> {
  return new Set(getAvailableSkillTypes());
}

/**
 * Hook for handling input commands.
 *
 * Uses the command registry to look up commands by name or alias,
 * then executes the appropriate handler based on command type.
 */
export function useCommandHandler(options: UseCommandHandlerOptions) {
  const { onExit, onTransferWithAgent, chatActions, overlays } = options;
  const { exit } = useApp();

  const {
    sendMessage,
    addSystemMessage,
    clearMessages,
    compactHistory,
    executeSkill,
    executeBashCommand,
    parseSlashCommand,
    switchAgent,
    resumeSession,
  } = chatActions;

  const {
    showAgentSelector,
    showTransferSelector,
    showResumeSelector,
    showMCPInstallSelector,
    showDebugPrompt,
    showFirebaseWizard,
  } = overlays;

  const handleSlashCommand = useCallback(
    async (commandName: string, args: string[]) => {
      const commands = getCommands();
      const command = getCommand(commandName, commands);

      if (!command) {
        addSystemMessage(`Unknown command: /${commandName}`);
        return;
      }

      // Handle commands based on their registered name
      switch (command.name) {
        case 'help':
          addSystemMessage(generateHelpText());
          return;

        case 'new':
          await clearMessages();
          return;

        case 'compact': {
          const forceArg = args[0];
          await compactHistory(forceArg === 'force');
          return;
        }

        case 'transfer': {
          const targetAgent = args[0];
          if (!targetAgent) {
            showTransferSelector();
          } else {
            await onTransferWithAgent(targetAgent);
          }
          return;
        }

        case 'agent': {
          const agentName = args[0];
          if (!agentName) {
            showAgentSelector();
          } else {
            await switchAgent(agentName);
          }
          return;
        }

        case 'resume': {
          const sessionId = args[0];
          if (!sessionId) {
            await showResumeSelector();
          } else {
            const ok = await resumeSession(sessionId);
            if (!ok) {
              addSystemMessage('Cannot resume while streaming.');
            }
          }
          return;
        }

        case 'install-mcp':
          showMCPInstallSelector();
          return;

        case 'debug':
          showDebugPrompt();
          return;

        case 'firebase':
          showFirebaseWizard();
          return;

        case 'update':
          handleUpdateCommand(addSystemMessage);
          return;

        case 'exit':
          onExit();
          exit();
          return;

        default:
          // Handle skill commands
          if (getSkillCommands().has(command.name)) {
            executeSkill(command.name as SkillType);
            return;
          }

          // Fallback for unhandled commands
          addSystemMessage(`Command /${command.name} is not implemented yet`);
          return;
      }
    },
    [
      addSystemMessage,
      clearMessages,
      compactHistory,
      executeSkill,
      switchAgent,
      resumeSession,
      showAgentSelector,
      showTransferSelector,
      showResumeSelector,
      showMCPInstallSelector,
      showDebugPrompt,
      showFirebaseWizard,
      onTransferWithAgent,
      onExit,
      exit,
    ],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      // Check for bash command first (! prefix)
      const bashResult = parseBashCommand(input);
      if (bashResult.handled && bashResult.command) {
        await executeBashCommand(bashResult.command);
        return;
      }

      // Check for slash command
      const slashResult = parseSlashCommand(input);
      if (slashResult.handled && slashResult.command) {
        await handleSlashCommand(slashResult.command, slashResult.args ?? []);
        return;
      }

      await sendMessage(input);
    },
    [executeBashCommand, parseSlashCommand, handleSlashCommand, sendMessage],
  );

  return { handleSubmit };
}
