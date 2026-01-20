import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { memo } from 'react';

interface ToolCallDisplayProps {
  toolName: string;
  content: string;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
}

const ToolCallDisplayInternal: React.FC<ToolCallDisplayProps> = ({
  toolName,
  content,
  status = 'complete',
}) => {
  const isLoading = status === 'pending' || status === 'streaming';
  const isComplete = status === 'complete';
  const isError = status === 'error';

  return (
    <Box marginY={0} paddingX={1} marginLeft={2}>
      <Text dimColor>
        <Text color="magenta">[Tool] </Text>
        {isLoading && (
          <Text color="yellow">
            <Spinner type="dots" />{' '}
          </Text>
        )}
        {isComplete && <Text color="green">✓ </Text>}
        {isError && <Text color="red">✗ </Text>}
        <Text bold>{toolName}</Text>
        {content && <Text>: {content}</Text>}
      </Text>
    </Box>
  );
};

export const ToolCallDisplay = memo(ToolCallDisplayInternal);
