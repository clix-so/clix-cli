/**
 * Message streaming hook for handling streamed agent responses.
 */
import { useCallback } from 'react';
import type { AgentMessage, AgentTextStreamMode } from '../../../lib/executor';
import { normalizeStreamText } from '../../../lib/utils/stream-text';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';

export interface StreamingOptions {
  signal?: AbortSignal;
}

export interface StreamingProcessResult {
  aborted: boolean;
  errorMessage: string | null;
}

type ChatDispatch = ReturnType<typeof useChatContext>['dispatch'];

export function mergeStreamText(
  current: string,
  chunk: string,
  streamMode: AgentTextStreamMode = 'append',
): string {
  if (streamMode === 'replace') {
    return chunk;
  }
  return `${current}${chunk}`;
}

function getInterruptedContent(content: string): string {
  const interruptedSuffix = content.endsWith('\n') ? '[Interrupted]' : '\n\n[Interrupted]';
  return `${content}${interruptedSuffix}`;
}

function markPendingToolsComplete(dispatch: ChatDispatch, pendingToolIds: string[]): void {
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

function processStreamMessage(params: {
  message: AgentMessage;
  dispatch: ChatDispatch;
  agentMessageId: string;
  accumulatedContent: string;
  pendingToolIds: string[];
}): string {
  const { message, dispatch, agentMessageId, accumulatedContent, pendingToolIds } = params;

  switch (message.type) {
    case 'text': {
      const nextContent = mergeStreamText(
        accumulatedContent,
        normalizeStreamText(message.content),
        message.streamMode,
      );
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          id: agentMessageId,
          updates: { content: nextContent, status: 'streaming' },
        },
      });
      return nextContent;
    }

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
      return accumulatedContent;
    }

    case 'tool_result': {
      const toolId = pendingToolIds.shift();
      if (toolId) {
        const normalizedResult = message.content.replace(/\s+/g, ' ').trim();
        const truncatedResult =
          normalizedResult.length > 400 ? `${normalizedResult.slice(0, 397)}...` : normalizedResult;
        const updates: { status: 'complete'; content?: string } = { status: 'complete' };
        if (truncatedResult) {
          updates.content = truncatedResult;
        }
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: toolId,
            updates,
          },
        });
      }
      return accumulatedContent;
    }

    case 'error':
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          id: agentMessageId,
          updates: { content: message.content, status: 'error' },
        },
      });
      return accumulatedContent;

    case 'complete':
      return accumulatedContent;
  }
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
    ): Promise<StreamingProcessResult> => {
      const { signal } = options;
      let accumulatedContent = '';
      let aborted = false;
      let errorMessage: string | null = null;
      // Track pending tool message IDs locally to avoid stale closure issues
      const pendingToolIds: string[] = [];

      for await (const message of messageGenerator) {
        if (signal?.aborted) {
          aborted = true;
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              id: agentMessageId,
              updates: {
                content: getInterruptedContent(accumulatedContent),
                status: 'complete',
              },
            },
          });
          markPendingToolsComplete(dispatch, pendingToolIds);
          break;
        }

        if (message.type === 'error') {
          errorMessage = message.content;
        }

        accumulatedContent = processStreamMessage({
          message,
          dispatch,
          agentMessageId,
          accumulatedContent,
          pendingToolIds,
        });
      }

      // Ensure the message is marked complete (if not aborted and no error surfaced)
      if (!signal?.aborted && !errorMessage) {
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: agentMessageId,
            updates: { status: 'complete' },
          },
        });
      }

      if (!aborted) {
        markPendingToolsComplete(dispatch, pendingToolIds);
      }

      return {
        aborted,
        errorMessage,
      };
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
