/**
 * Command handler hook for processing slash commands.
 *
 * Uses the command registry pattern for extensibility and maintainability.
 */
import { useApp } from 'ink';
import { useCallback } from 'react';
import { generateHelpText, getCommand, getCommands } from '../../../lib/commands';
import {
  checkForUpdate,
  detectInstallationMethod,
  getUpdateCommand,
} from '../../../lib/services/update-service';
import { getAvailableSkillTypes, type SkillType } from '../../../lib/skills';
import { parseBashCommand } from './useBashExecution';
import type { useChatActions } from './useChatActions';
import type { useOverlays } from './useOverlays';

/**
 * Handle the /update command - checks for available updates.
 */
async function handleUpdateCommand(addSystemMessage: (msg: string) => void): Promise<void> {
  addSystemMessage('Checking for updates...');
  try {
    const [updateResult, installInfo] = await Promise.all([
      checkForUpdate(5000),
      detectInstallationMethod(),
    ]);

    if (updateResult.error) {
      addSystemMessage(`Failed to check for updates: ${updateResult.error}`);
      return;
    }

    if (!updateResult.hasUpdate) {
      addSystemMessage(`You're on the latest version (${updateResult.currentVersion})`);
      return;
    }

    const updateCmd = getUpdateCommand(installInfo);
    addSystemMessage(
      `Update available: ${updateResult.currentVersion} -> ${updateResult.latestVersion}\n` +
        `Run: ${updateCmd}`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addSystemMessage(`Failed to check for updates: ${errorMessage}`);
  }
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

        case 'update':
          await handleUpdateCommand(addSystemMessage);
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
