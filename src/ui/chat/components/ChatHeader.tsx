import { Box, Text } from 'ink';
import type React from 'react';
import type { AgentInfo } from '../../../lib/agents';
import { VERSION } from '../../../lib/version';

// Match Codex CLI inner width
const INNER_WIDTH = 56;

interface ChatHeaderProps {
  agent: AgentInfo | null;
  isStreaming?: boolean;
  directory?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ agent, directory = process.cwd() }) => {
  // Truncate directory path for display (leave room for "directory: " and padding)
  const maxDirLength = INNER_WIDTH - 13;
  const displayDir =
    directory.length > maxDirLength ? `${directory.slice(0, maxDirLength - 3)}...` : directory;

  const agentName = agent?.displayName ?? 'Not selected';
  const horizontalBorder = '─'.repeat(INNER_WIDTH);

  // Calculate padding for each line
  const titleText = ` [>] Clix (v${VERSION})`;
  const titlePadding = ' '.repeat(Math.max(0, INNER_WIDTH - titleText.length));

  const agentPrefix = ' agent:     ';
  const agentSeparator = '   ';
  const agentHint = '/agent to change';
  const agentText = agentPrefix + agentName + agentSeparator + agentHint;
  const agentPadding = ' '.repeat(Math.max(0, INNER_WIDTH - agentText.length));

  const dirPrefix = ' directory: ';
  const dirText = dirPrefix + displayDir;
  const dirPadding = ' '.repeat(Math.max(0, INNER_WIDTH - dirText.length));

  const emptyContent = ' '.repeat(INNER_WIDTH);

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Text dimColor>╭{horizontalBorder}╮</Text>

      {/* Title line */}
      <Box>
        <Text dimColor>│</Text>
        <Text> </Text>
        <Text color="white" backgroundColor="black" bold>
          {' < '}
        </Text>
        <Text bold>{' Clix'}</Text>
        <Text>{` (v${VERSION})`}</Text>
        <Text>{titlePadding}</Text>
        <Text dimColor>│</Text>
      </Box>

      {/* Empty line */}
      <Box>
        <Text dimColor>│</Text>
        <Text>{emptyContent}</Text>
        <Text dimColor>│</Text>
      </Box>

      {/* Agent line */}
      <Box>
        <Text dimColor>│{agentPrefix}</Text>
        <Text bold>{agentName}</Text>
        <Text>{agentSeparator}</Text>
        <Text color="blueBright" bold>
          /agent
        </Text>
        <Text dimColor> to change</Text>
        <Text>{agentPadding}</Text>
        <Text dimColor>│</Text>
      </Box>

      {/* Directory line */}
      <Box>
        <Text dimColor>│{dirPrefix}</Text>
        <Text>{displayDir}</Text>
        <Text>{dirPadding}</Text>
        <Text dimColor>│</Text>
      </Box>

      {/* Bottom border */}
      <Text dimColor>╰{horizontalBorder}╯</Text>
    </Box>
  );
};
