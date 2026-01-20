import { Box } from 'ink';
import type React from 'react';
import { memo } from 'react';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay';

interface AgentMessageProps {
  content: string;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  agentName?: string;
}

const AgentMessageInternal: React.FC<AgentMessageProps> = ({ content, status = 'complete' }) => {
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
};

export const AgentMessage = memo(AgentMessageInternal);
