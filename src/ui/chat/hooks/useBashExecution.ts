/**
 * Bash execution hook for running shell commands in chat context.
 */
import { useCallback } from 'react';
import {
  executeBash,
  formatBashForContext,
  formatBashResult,
} from '../../../lib/services/bash-service';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';
import type { SessionPersistenceAPI } from './useSessionPersistence';

/**
 * Result of bash command parsing.
 */
export interface BashCommandResult {
  /** Whether the input was handled as a bash command */
  handled: boolean;
  /** The command to execute (without prefix) */
  command?: string;
}

/**
 * Parses input to check if it's a bash command.
 *
 * @param input - User input string
 * @returns Parse result
 */
export function parseBashCommand(input: string): BashCommandResult {
  if (input.startsWith('!')) {
    const command = input.slice(1).trim();
    if (command) {
      return {
        handled: true,
        command,
      };
    }
  }
  return { handled: false };
}

/**
 * Hook for executing bash commands in chat context.
 */
export function useBashExecution(refs: ChatRefs, session: SessionPersistenceAPI) {
  const { dispatch } = useChatContext();
  const { executorRef, abortControllerRef } = refs;
  const { persistSession } = session;

  const executeBashCommand = useCallback(
    async (command: string) => {
      // Create local abort controller to avoid race conditions
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      // Add pending bash message
      const messageId = generateMessageId();
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: messageId,
          role: 'bash',
          content: '',
          timestamp: new Date(),
          status: 'pending',
          bashCommand: command,
        },
      });

      // Add to input history
      dispatch({ type: 'ADD_TO_HISTORY', payload: `!${command}` });

      try {
        // Execute the command
        const result = await executeBash(command, {
          workingDirectory: process.cwd(),
          signal,
        });

        // Update message with result
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: messageId,
            updates: {
              content: formatBashResult(result),
              status: result.success ? 'complete' : 'error',
              bashExitCode: result.exitCode,
              bashTruncated: result.truncated,
            },
          },
        });

        // Add to executor history for AI context
        if (executorRef.current) {
          const contextMessage = formatBashForContext(result);
          const history = executorRef.current.getHistory();
          history.push({ role: 'user', content: contextMessage });
          executorRef.current.setHistory(history);
        }
      } catch (error) {
        // Handle errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: messageId,
            updates: {
              content: `Error: ${errorMessage}`,
              status: 'error',
              bashExitCode: 1,
            },
          },
        });
      } finally {
        // Only clear if still our controller (avoid race condition)
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        await persistSession();
      }
    },
    [dispatch, executorRef, abortControllerRef, persistSession],
  );

  const cancelBashCommand = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [abortControllerRef]);

  return {
    executeBashCommand,
    cancelBashCommand,
  };
}
