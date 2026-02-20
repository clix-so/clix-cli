/**
 * Main chat actions hook that composes all chat functionality.
 *
 * This hook acts as a facade, combining:
 * - useAgentManagement: Agent initialization, switching, listing
 * - useMessageSending: Message sending, cancellation, skills execution
 * - useHistoryManagement: History navigation, clearing, compaction, transfer
 * - useSlashCommands: Slash command parsing
 * - useBashExecution: Bash command execution
 */
import { useCallback, useRef } from 'react';
import type { AgentExecutor } from '../../../lib/executor';
import { useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';
import { useAgentManagement } from './useAgentManagement';
import { useBashExecution } from './useBashExecution';
import { useHistoryManagement } from './useHistoryManagement';
import { useMessageSending } from './useMessageSending';
import { useSessionPersistence } from './useSessionPersistence';
import { useSlashCommands } from './useSlashCommands';

/**
 * Unified hook for all chat actions.
 *
 * @example
 * ```tsx
 * function ChatInput() {
 *   const { sendMessage, parseSlashCommand, navigateHistory } = useChatActions();
 *
 *   const handleSubmit = async (input: string) => {
 *     const { handled, command, args } = parseSlashCommand(input);
 *     if (handled) {
 *       // Handle slash command
 *       return;
 *     }
 *     await sendMessage(input);
 *   };
 * }
 * ```
 */
export interface ChatActionsOptions {
  initialSessionId?: string;
}

export function useChatActions(options?: ChatActionsOptions) {
  const { state } = useChatContext();

  // Shared refs between hooks
  const executorRef = useRef<AgentExecutor | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatSessionIdRef = useRef<string | null>(null);
  const agentSessionMapRef = useRef<Record<string, string | null>>({});

  const refs: ChatRefs = { executorRef, abortControllerRef, chatSessionIdRef, agentSessionMapRef };

  const sessionPersistence = useSessionPersistence(refs, {
    initialSessionId: options?.initialSessionId,
  });

  // Compose hooks
  const agentManagement = useAgentManagement(refs, sessionPersistence);
  const messageSending = useMessageSending(refs, sessionPersistence);
  const historyManagement = useHistoryManagement(refs, sessionPersistence);
  const slashCommands = useSlashCommands();
  const bashExecution = useBashExecution(refs, sessionPersistence);

  const resumeSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (state.isStreaming) {
        return false;
      }

      await sessionPersistence.persistSession();
      const preferredAgent = await sessionPersistence.loadSession(sessionId);

      // Re-initialize agent so executor session IDs are restored.
      if (preferredAgent) {
        await agentManagement.initializeAgent(preferredAgent);
      } else if (state.currentAgent) {
        await agentManagement.initializeAgent(state.currentAgent);
      }

      await sessionPersistence.persistSession();
      return true;
    },
    [agentManagement, sessionPersistence, state.currentAgent, state.isStreaming],
  );

  return {
    // Session persistence
    sessionReady: sessionPersistence.isReady,
    preferredAgent: sessionPersistence.preferredAgent,
    resumeSession,

    // Agent management
    initializeAgent: agentManagement.initializeAgent,
    switchAgent: agentManagement.switchAgent,
    listAgents: agentManagement.listAgents,
    currentAgent: agentManagement.currentAgent,

    // Message sending
    sendMessage: messageSending.sendMessage,
    cancelRequest: messageSending.cancelRequest,
    addSystemMessage: messageSending.addSystemMessage,
    executeSkill: messageSending.executeSkill,
    executeSkillWithResult: messageSending.executeSkillWithResult,
    executeDebugSession: messageSending.executeDebugSession,
    isStreaming: messageSending.isStreaming,

    // History management
    clearMessages: historyManagement.clearMessages,
    compactHistory: historyManagement.compactHistory,
    transferSession: historyManagement.transferSession,
    navigateHistory: historyManagement.navigateHistory,
    contextUsage: historyManagement.contextUsage,
    inputHistory: historyManagement.inputHistory,
    historyIndex: historyManagement.historyIndex,

    // Slash commands
    parseSlashCommand: slashCommands.parseSlashCommand,

    // Bash execution
    executeBashCommand: bashExecution.executeBashCommand,
    cancelBashCommand: bashExecution.cancelBashCommand,

    // State
    messages: state.messages,
  };
}
