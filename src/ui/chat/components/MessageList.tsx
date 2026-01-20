import { Box, Text } from 'ink';
import type React from 'react';
import { ToolCallDisplay } from '@/ui/components/ToolCallDisplay';
import type { ChatMessage } from '../context/ChatContext';
import { AgentMessage } from './AgentMessage';
import { UserMessage } from './UserMessage';

interface MessageListProps {
  messages: ChatMessage[];
  maxHeight?: number;
  agentName?: string;
}

/**
 * Filter messages to show only the current tool call (not accumulated list).
 * Completed tool calls are hidden, only the last pending/streaming one is shown.
 */
function filterToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let completedToolCount = 0;

  // Find the last pending/streaming tool
  let lastPendingTool: ChatMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.role === 'tool' &&
      (message.status === 'pending' || message.status === 'streaming')
    ) {
      lastPendingTool = message;
      break;
    }
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      if (message.status === 'complete' || message.status === 'error') {
        // Hide completed tools, just count them
        completedToolCount++;
      } else if (lastPendingTool && message.id === lastPendingTool.id) {
        // Show only the last pending/streaming tool
        result.push(message);
      }
      // Skip other pending tools
    } else {
      // For non-tool messages, add a summary if there were completed tools before this message
      if (completedToolCount > 0 && message.role === 'agent') {
        // Add tool summary before agent message
        result.push({
          id: `tool-summary-${message.id}`,
          role: 'system',
          content: `[Tool] ✓ ${completedToolCount} tool${completedToolCount > 1 ? 's' : ''} executed`,
          timestamp: message.timestamp,
        });
        completedToolCount = 0;
      }
      result.push(message);
    }
  }

  return result;
}

// Helper function to render a single message
function renderMessage(message: ChatMessage, agentName?: string) {
  switch (message.role) {
    case 'user':
      return <UserMessage key={message.id} content={message.content} />;

    case 'agent':
      return (
        <AgentMessage
          key={message.id}
          content={message.content}
          status={message.status}
          agentName={agentName}
        />
      );

    case 'tool':
      return (
        <ToolCallDisplay
          key={message.id}
          toolName={message.toolName ?? 'Unknown'}
          content={message.content}
          status={message.status}
        />
      );

    case 'system':
      return (
        <Box key={message.id} paddingX={2} marginY={0}>
          <Text dimColor>{message.content}</Text>
        </Box>
      );

    default:
      return null;
  }
}

export const MessageList: React.FC<MessageListProps> = ({ messages, maxHeight, agentName }) => {
  if (messages.length === 0) {
    return (
      <Box flexDirection="column" paddingX={2}>
        <Box>
          <Text bold>Tip: </Text>
          <Text dimColor>
            Type <Text color="blue">/</Text> to open the command popup; Tab autocompletes slash
            commands.
          </Text>
        </Box>
      </Box>
    );
  }

  // Filter tool messages to show only current execution
  const filteredMessages = filterToolMessages(messages);

  // Render only the last N messages if maxHeight is specified
  const displayMessages = maxHeight ? filteredMessages.slice(-maxHeight) : filteredMessages;

  return (
    <Box flexDirection="column">
      {/* Render all messages without Static to maintain proper layout order */}
      {displayMessages.map((message) => renderMessage(message, agentName))}
    </Box>
  );
};
