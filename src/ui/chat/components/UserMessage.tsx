import { Box, Text } from 'ink';
import type React from 'react';
import { memo } from 'react';

interface UserMessageProps {
  content: string;
}

const UserMessageInternal: React.FC<UserMessageProps> = ({ content }) => {
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
};

export const UserMessage = memo(UserMessageInternal);
