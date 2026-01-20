import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';

export type StatusType = 'info' | 'success' | 'warning' | 'error' | 'loading';

interface StatusMessageProps {
  type: StatusType;
  message: string;
}

const STATUS_PREFIXES = {
  info: '→',
  success: '✓',
  warning: '!',
  error: '✗',
  loading: null,
};

const STATUS_COLORS = {
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  loading: 'gray',
} as const;

export const StatusMessage: React.FC<StatusMessageProps> = ({ type, message }) => {
  const prefix = STATUS_PREFIXES[type];
  const color = STATUS_COLORS[type];

  return (
    <Box>
      {type === 'loading' ? (
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
      ) : (
        <Text color={color} bold>
          {prefix}
        </Text>
      )}
      <Text> {message}</Text>
    </Box>
  );
};
