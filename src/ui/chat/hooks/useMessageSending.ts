/**
 * Message sending hook for user message submission.
 */
import { useCallback } from 'react';
import { getDebugPrompt } from '../../../lib/services/debug-service';
import { executeSkill as executeSkillLib, getSkillInfo, type SkillType } from '../../../lib/skills';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';
import { useMessageStreaming } from './useMessageStreaming';
import type { SessionPersistenceAPI } from './useSessionPersistence';

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

  const executeSkill = useCallback(
    async (skillType: SkillType) => {
      if (!executorRef.current) {
        addSystemMessage('No agent configured. Please run "clix config" to select an agent.');
        return;
      }

      const skillInfo = getSkillInfo(skillType);
      if (!skillInfo) {
        addSystemMessage(`Unknown skill: ${skillType}`);
        return;
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
    executeDebugSession,
    isStreaming: state.isStreaming,
  };
}
