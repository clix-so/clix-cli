/**
 * History management hook for chat history operations.
 */
import { useCallback, useMemo } from 'react';
import { CLAUDE_SONNET_CONTEXT_WINDOW } from '../../../lib/services/history-compaction';
import {
  type TransferAgent,
  type TransferResult,
  transferToAgent,
} from '../../../lib/services/transfer-service';
import { countTokens } from '../../../lib/utils/tokenizer';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs, ContextUsage } from './types';
import { useMessageStreaming } from './useMessageStreaming';
import type { SessionPersistenceAPI } from './useSessionPersistence';

/**
 * Hook for history management operations.
 */
export function useHistoryManagement(refs: ChatRefs, session: SessionPersistenceAPI) {
  const { state, dispatch } = useChatContext();
  const { executorRef } = refs;
  const { addSystemMessage } = useMessageStreaming(refs);
  const { persistSession, startNewSession } = session;

  const clearMessages = useCallback(async () => {
    dispatch({ type: 'CLEAR_MESSAGES' });

    // Clear executor history as well
    executorRef.current?.clearHistory();

    // Start a new persisted session file (so /new creates a new session)
    await startNewSession();

    addSystemMessage('New session started.');
    await persistSession();
  }, [dispatch, executorRef, addSystemMessage, startNewSession, persistSession]);

  const compactHistory = useCallback(
    async (force?: boolean) => {
      if (!executorRef.current) {
        addSystemMessage('No agent configured.');
        return;
      }

      addSystemMessage('Compacting conversation history...');

      dispatch({ type: 'SET_STREAMING', payload: true });

      try {
        const result = await executorRef.current.compactHistory(force);

        if (result.compacted) {
          addSystemMessage(
            `History compacted: ${result.messagesCompacted} messages summarized, ${result.messagesPreserved} preserved. Size: ${result.originalLength} → ${result.newLength} chars.`,
          );
        } else {
          addSystemMessage('History does not need compaction yet.');
        }
      } catch (error) {
        addSystemMessage(
          `Compaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      } finally {
        await session.persistSession();
        dispatch({ type: 'SET_STREAMING', payload: false });
      }
    },
    [dispatch, executorRef, addSystemMessage, session],
  );

  const transferSession = useCallback(
    async (targetAgent: TransferAgent): Promise<TransferResult> => {
      const validAgents: TransferAgent[] = ['claude', 'codex'];
      if (!validAgents.includes(targetAgent)) {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: generateMessageId(),
            role: 'system',
            content: `Invalid agent: ${targetAgent}. Available: ${validAgents.join(', ')}`,
            timestamp: new Date(),
          },
        });
        return { success: false };
      }

      const history = executorRef.current?.getHistory() ?? [];

      const result = await transferToAgent(history, {
        agent: targetAgent,
        workingDirectory: process.cwd(),
      });

      if (!result.success) {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: generateMessageId(),
            role: 'system',
            content: `Transfer failed: ${result.error}`,
            timestamp: new Date(),
          },
        });
        return { success: false };
      }

      // Don't show in chat - will be printed to console on exit
      return result;
    },
    [dispatch, executorRef],
  );

  const navigateHistory = useCallback(
    (direction: 'up' | 'down'): string | null => {
      const { inputHistory, historyIndex } = state;

      if (inputHistory.length === 0) {
        return null;
      }

      let newIndex: number;

      if (direction === 'up') {
        if (historyIndex === -1) {
          newIndex = inputHistory.length - 1;
        } else if (historyIndex > 0) {
          newIndex = historyIndex - 1;
        } else {
          return null;
        }
      } else {
        if (historyIndex === -1) {
          return null;
        } else if (historyIndex < inputHistory.length - 1) {
          newIndex = historyIndex + 1;
        } else {
          dispatch({ type: 'SET_HISTORY_INDEX', payload: -1 });
          return '';
        }
      }

      dispatch({ type: 'SET_HISTORY_INDEX', payload: newIndex });
      return inputHistory[newIndex] ?? null;
    },
    [dispatch, state],
  );

  // Calculate context usage percentage
  const contextUsage = useMemo((): ContextUsage => {
    const totalChars = state.messages.reduce((acc, msg) => acc + msg.content.length, 0);
    const maxTokens = CLAUDE_SONNET_CONTEXT_WINDOW;
    const usedTokens = Math.min(
      maxTokens,
      state.messages.reduce((acc, msg) => acc + countTokens(msg.content), 0),
    );
    const maxChars = maxTokens * 4;
    const usedPercent = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
    const remainingPercent = Math.max(0, 100 - usedPercent);
    return {
      used: usedPercent,
      remaining: remainingPercent,
      totalChars,
      maxChars,
      usedTokens,
      maxTokens,
    };
  }, [state.messages]);

  return {
    clearMessages,
    compactHistory,
    transferSession,
    navigateHistory,
    contextUsage,
    inputHistory: state.inputHistory,
    historyIndex: state.historyIndex,
  };
}
