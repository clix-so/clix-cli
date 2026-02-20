/**
 * Message sending hook for user message submission.
 */
import { useCallback } from 'react';
import type { PreparationContext } from '../../../commands/skill/preparation';
import { getDebugPrompt } from '../../../lib/services/debug-service';
import {
  executeSkill as executeSkillLib,
  getSkillInfo,
  type SkillOptions,
  type SkillType,
} from '../../../lib/skills';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';
import { useMessageStreaming } from './useMessageStreaming';
import type { SessionPersistenceAPI } from './useSessionPersistence';

export interface SkillExecutionResult {
  success: boolean;
  aborted: boolean;
  error?: string;
}

export interface SkillExecutionOptions {
  installPhase?: SkillOptions['installPhase'];
}

/**
 * Hook for message sending operations.
 */
export function useMessageSending(refs: ChatRefs, session: SessionPersistenceAPI) {
  const { state, dispatch } = useChatContext();
  const { executorRef, abortControllerRef } = refs;
  const { persistSession } = session;
  const { addSystemMessage, processStreamingMessages, createAgentMessage, handleStreamingError } =
    useMessageStreaming(refs);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [abortControllerRef]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!executorRef.current) {
        addSystemMessage('No agent configured. Please run "clix config" to select an agent.');
        return;
      }

      // Add user message
      const userMessageId = generateMessageId();
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: userMessageId,
          role: 'user',
          content,
          timestamp: new Date(),
        },
      });

      // Add to input history
      dispatch({ type: 'ADD_TO_HISTORY', payload: content });

      // Create agent message placeholder
      const agentMessageId = createAgentMessage();

      dispatch({ type: 'SET_STREAMING', payload: true });

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      try {
        const messageGenerator = executorRef.current.execute(content, {
          workingDirectory: process.cwd(),
          signal,
        });

        await processStreamingMessages(messageGenerator, agentMessageId, { signal });
      } catch (error) {
        // Handle abort error gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          addSystemMessage('Request interrupted.');
        } else {
          handleStreamingError(error, agentMessageId);
        }
      } finally {
        abortControllerRef.current = null;
        await persistSession();
        dispatch({ type: 'SET_STREAMING', payload: false });
      }
    },
    [
      dispatch,
      executorRef,
      abortControllerRef,
      addSystemMessage,
      processStreamingMessages,
      createAgentMessage,
      handleStreamingError,
      persistSession,
    ],
  );

  const executeSkillWithResult = useCallback(
    async (
      skillType: SkillType,
      preparationContext?: PreparationContext,
      options?: SkillExecutionOptions,
    ): Promise<SkillExecutionResult> => {
      if (!executorRef.current) {
        const error = 'No agent configured. Please run "clix config" to select an agent.';
        addSystemMessage(error);
        return { success: false, aborted: false, error };
      }

      const skillInfo = getSkillInfo(skillType);
      if (!skillInfo) {
        const error = `Unknown skill: ${skillType}`;
        addSystemMessage(error);
        return { success: false, aborted: false, error };
      }

      // Add system message showing skill activation
      addSystemMessage(`Starting skill: ${skillInfo.name} - ${skillInfo.description}`);

      // Create agent message placeholder
      const agentMessageId = createAgentMessage();

      dispatch({ type: 'SET_STREAMING', payload: true });

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      try {
        const messageGenerator = executeSkillLib(skillType, executorRef.current, {
          projectPath: process.cwd(),
          signal,
          oneShot: false, // Chat mode: enable session persistence
          preparationContext,
          installPhase: options?.installPhase,
        });

        const streamResult = await processStreamingMessages(messageGenerator, agentMessageId, {
          signal,
        });

        if (streamResult.aborted || signal.aborted) {
          addSystemMessage('Request interrupted.');
          return {
            success: false,
            aborted: true,
            error: 'Request interrupted.',
          };
        }

        if (streamResult.errorMessage) {
          return {
            success: false,
            aborted: false,
            error: streamResult.errorMessage,
          };
        }

        return {
          success: true,
          aborted: false,
        };
      } catch (error) {
        // Handle abort error gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          addSystemMessage('Request interrupted.');
          return {
            success: false,
            aborted: true,
            error: 'Request interrupted.',
          };
        } else {
          handleStreamingError(error, agentMessageId);
          return {
            success: false,
            aborted: false,
            error: error instanceof Error ? error.message : 'Unknown execution error',
          };
        }
      } finally {
        abortControllerRef.current = null;
        await persistSession();
        dispatch({ type: 'SET_STREAMING', payload: false });
      }
    },
    [
      dispatch,
      executorRef,
      abortControllerRef,
      addSystemMessage,
      processStreamingMessages,
      createAgentMessage,
      handleStreamingError,
      persistSession,
    ],
  );

  const executeSkill = useCallback(
    async (
      skillType: SkillType,
      preparationContext?: PreparationContext,
      options?: SkillExecutionOptions,
    ): Promise<void> => {
      await executeSkillWithResult(skillType, preparationContext, options);
    },
    [executeSkillWithResult],
  );

  const executeDebugSession = useCallback(
    async (problemDescription: string) => {
      if (!executorRef.current) {
        addSystemMessage('No agent configured. Please run "clix config" to select an agent.');
        return;
      }

      // Show problem description
      addSystemMessage(`Starting debug session for: "${problemDescription}"`);

      // Get debug prompt
      const debugPrompt = getDebugPrompt({
        problemDescription,
        projectPath: process.cwd(),
      });

      // Create agent message placeholder
      const agentMessageId = createAgentMessage();

      dispatch({ type: 'SET_STREAMING', payload: true });

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      try {
        const messageGenerator = executorRef.current.execute(debugPrompt, {
          workingDirectory: process.cwd(),
          signal,
        });

        await processStreamingMessages(messageGenerator, agentMessageId, { signal });
      } catch (error) {
        // Handle abort error gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          addSystemMessage('Request interrupted.');
        } else {
          handleStreamingError(error, agentMessageId);
        }
      } finally {
        abortControllerRef.current = null;
        await persistSession();
        dispatch({ type: 'SET_STREAMING', payload: false });
      }
    },
    [
      dispatch,
      executorRef,
      abortControllerRef,
      addSystemMessage,
      processStreamingMessages,
      createAgentMessage,
      handleStreamingError,
      persistSession,
    ],
  );
  return {
    sendMessage,
    cancelRequest,
    addSystemMessage,
    executeSkill,
    executeSkillWithResult,
    executeDebugSession,
    isStreaming: state.isStreaming,
  };
}
