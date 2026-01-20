/**
 * Message streaming hook for handling streamed agent responses.
 */
import { useCallback } from 'react';
import type { AgentMessage } from '../../../lib/executor';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';

export interface StreamingOptions {
  signal?: AbortSignal;
}

/**
 * Extract error message from various error types.
 * Uses duck typing first to handle cross-realm Error objects in bundled binaries.
 */
function extractErrorMessage(error: unknown): string {
  // Duck typing: check for message property first (handles cross-realm Errors)
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    // Only use message if it's a non-empty string
    if (typeof msg === 'string' && msg) {
      return msg;
    }
    // For non-string or empty message, try other extraction methods
  }

  // Standard Error check (also handles empty message via toString)
  if (error instanceof Error) {
    return error.message || error.toString();
  }

  // String error
  if (typeof error === 'string') {
    return error;
  }

  // Object without message property (or with non-string/empty message)
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  // Primitives (number, boolean, symbol, bigint)
  if (error !== undefined && error !== null) {
    return String(error);
  }

  // Unknown - add debug info
  return `Unknown error (type: ${typeof error})`;
}

/**
 * Hook for handling message streaming from agent.
 */
export function useMessageStreaming(_refs: ChatRefs) {
  const { state, dispatch } = useChatContext();

  const addSystemMessage = useCallback(
    (content: string) => {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: generateMessageId(),
          role: 'system',
          content,
          timestamp: new Date(),
        },
      });
    },
    [dispatch],
  );

  /**
   * Process streaming messages from an async generator.
   */
  const processStreamingMessages = useCallback(
    async (
      messageGenerator: AsyncGenerator<AgentMessage>,
      agentMessageId: string,
      options: StreamingOptions = {},
    ): Promise<void> => {
      const { signal } = options;
      let accumulatedContent = '';
      // Track pending tool message IDs locally to avoid stale closure issues
      const pendingToolIds: string[] = [];

      for await (const message of messageGenerator) {
        // Check if aborted
        if (signal?.aborted) {
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              id: agentMessageId,
              updates: {
                content: `${accumulatedContent}\n\n[Interrupted]`,
                status: 'complete',
              },
            },
          });
          // Mark any remaining pending tools as complete
          for (const toolId of pendingToolIds) {
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: toolId,
                updates: { status: 'complete' },
              },
            });
          }
          break;
        }

        switch (message.type) {
          case 'text':
            accumulatedContent += `\n${message.content}`;
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: agentMessageId,
                updates: { content: accumulatedContent, status: 'streaming' },
              },
            });
            break;

          case 'tool_call': {
            const toolMessageId = generateMessageId();
            pendingToolIds.push(toolMessageId);
            dispatch({
              type: 'ADD_MESSAGE',
              payload: {
                id: toolMessageId,
                role: 'tool',
                content: message.content,
                toolName: (message.metadata?.toolName as string) ?? 'Tool',
                timestamp: new Date(),
                status: 'pending',
              },
            });
            break;
          }

          case 'tool_result': {
            // Update the first pending tool message (FIFO order)
            const toolId = pendingToolIds.shift();
            if (toolId) {
              dispatch({
                type: 'UPDATE_MESSAGE',
                payload: {
                  id: toolId,
                  updates: { status: 'complete' },
                },
              });
            }
            break;
          }

          case 'error':
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: agentMessageId,
                updates: { content: message.content, status: 'error' },
              },
            });
            break;

          case 'complete':
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                id: agentMessageId,
                updates: { status: 'complete' },
              },
            });
            break;
        }
      }

      // Ensure the message is marked complete (if not aborted)
      if (!signal?.aborted) {
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: agentMessageId,
            updates: { status: 'complete' },
          },
        });
        // Mark any remaining pending tools as complete
        for (const toolId of pendingToolIds) {
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              id: toolId,
              updates: { status: 'complete' },
            },
          });
        }
      }
    },
    [dispatch],
  );

  /**
   * Create agent message placeholder and start streaming.
   */
  const createAgentMessage = useCallback((): string => {
    const agentMessageId = generateMessageId();
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        id: agentMessageId,
        role: 'agent',
        content: '',
        timestamp: new Date(),
        status: 'streaming',
      },
    });
    return agentMessageId;
  }, [dispatch]);

  /**
   * Handle streaming error.
   */
  const handleStreamingError = useCallback(
    (error: unknown, agentMessageId: string) => {
      const errorMessage = extractErrorMessage(error);
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          id: agentMessageId,
          updates: {
            content: errorMessage,
            status: 'error',
          },
        },
      });
    },
    [dispatch],
  );

  return {
    addSystemMessage,
    processStreamingMessages,
    createAgentMessage,
    handleStreamingError,
    messages: state.messages,
  };
}
