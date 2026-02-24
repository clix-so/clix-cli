import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { MarkdownDisplay } from '@/ui/utils/MarkdownDisplay';
import { BashOutputDisplay } from './BashOutputDisplay';
import { ToolCallDisplay } from './ToolCallDisplay';

export interface ChatMessageListMessage {
  id: string;
  role: 'user' | 'agent' | 'tool' | 'system' | 'bash';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  toolName?: string;
  bashCommand?: string;
  bashExitCode?: number | null;
  bashTruncated?: boolean;
}

interface ChatMessageListProps {
  messages: ChatMessageListMessage[];
  maxHeight?: number;
  agentName?: string;
  emptyState?: ReactNode;
}

const DEFAULT_EMPTY_STATE = (
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

function UserMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box marginY={0} paddingX={2} flexDirection="column">
      <Box>
        <Text color="blue" bold>
          {'>'}{' '}
        </Text>
        <Text dimColor>{content}</Text>
      </Box>
    </Box>
  );
}

function AgentMessage({
  content,
  status = 'complete',
}: {
  content: string;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  agentName?: string;
}): React.ReactElement {
  const isError = status === 'error';

  return (
    <Box flexDirection="column" marginY={0} paddingX={2}>
      {content && (
        <Box flexDirection="column">
          <MarkdownDisplay text={content} isError={isError} />
        </Box>
      )}
    </Box>
  );
}

/**
 * Filter messages to show only the current tool call (not accumulated list).
 * Completed tool calls are hidden, only the last pending/streaming one is shown.
 */
function filterToolMessages(messages: ChatMessageListMessage[]): ChatMessageListMessage[] {
  const result: ChatMessageListMessage[] = [];
  let completedToolCount = 0;

  let lastPendingTool: ChatMessageListMessage | null = null;
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
        completedToolCount++;
      } else if (lastPendingTool && message.id === lastPendingTool.id) {
        result.push(message);
      }
    } else {
      if (completedToolCount > 0 && message.role === 'agent') {
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

function renderMessage(message: ChatMessageListMessage, agentName?: string): React.ReactNode {
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

    case 'bash':
      return (
        <BashOutputDisplay
          key={message.id}
          command={message.bashCommand ?? ''}
          output={message.content}
          exitCode={message.bashExitCode}
          status={message.status}
          truncated={message.bashTruncated}
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

const ChatMessageListInternal: React.FC<ChatMessageListProps> = ({
  messages,
  maxHeight,
  agentName,
  emptyState,
}) => {
  if (messages.length === 0) {
    return <>{emptyState ?? DEFAULT_EMPTY_STATE}</>;
  }

  const filteredMessages = filterToolMessages(messages);
  const displayMessages = maxHeight ? filteredMessages.slice(-maxHeight) : filteredMessages;

  return (
    <Box flexDirection="column">
      {displayMessages.map((message) => renderMessage(message, agentName))}
    </Box>
  );
};

export const ChatMessageList = memo(ChatMessageListInternal);
