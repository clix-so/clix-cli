import { Box, Text } from 'ink';
import type React from 'react';
import { memo } from 'react';

interface ChatFooterProps {
  isStreaming?: boolean;
  contextRemaining?: number;
  usedTokens?: number;
  maxTokens?: number;
}

export const ChatFooter: React.FC<ChatFooterProps> = memo(
  ({ isStreaming = false, contextRemaining = 100, usedTokens, maxTokens }) => {
    // Color based on remaining context
    const contextColor = contextRemaining > 50 ? 'green' : contextRemaining > 20 ? 'yellow' : 'red';
    const formatCompact = (value: number) => {
      if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
      if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
      if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
      return `${value}`;
    };

    const tokenDisplay =
      typeof usedTokens === 'number' && typeof maxTokens === 'number'
        ? `${formatCompact(usedTokens)}/${formatCompact(maxTokens)} tokens used`
        : '';

    return (
      <Box flexDirection="row" justifyContent="space-between" paddingX={2}>
        <Box>
          <Text dimColor>
            {isStreaming ? (
              <>
                <Text color="gray">Ctrl+C</Text>
                <Text> or </Text>
                <Text color="gray">Esc</Text>
                <Text> to cancel</Text>
              </>
            ) : (
              <>
                <Text>Type </Text>
                <Text color="gray">/</Text>
                <Text> for commands · </Text>
                <Text color="gray">Tab</Text>
                <Text> to autocomplete</Text>
              </>
            )}
          </Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text dimColor>
            <Text color={contextColor}>{contextRemaining}%</Text>
            <Text> context left</Text>
          </Text>
          {tokenDisplay ? <Text dimColor>{tokenDisplay}</Text> : null}
        </Box>
      </Box>
    );
  },
);
