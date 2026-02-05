import { Box, Text } from 'ink';
import type React from 'react';
import type { AgentInfo } from '../../../lib/agents';
import type { ProjectConfig } from '../../../lib/config';
import { formatPath } from '../../../lib/utils/path';
import { VERSION } from '../../../lib/version';

// Match Codex CLI inner width
const INNER_WIDTH = 56;

interface ChatHeaderProps {
  agent: AgentInfo | null;
  isStreaming?: boolean;
  directory?: string;
  projectConfig?: ProjectConfig | null;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  agent,
  directory = process.cwd(),
  projectConfig,
}) => {
  // Replace home directory with ~ for shorter display
  const shortDir = formatPath(directory);

  // Truncate directory path for display (leave room for "directory: " and padding)
  const maxDirLength = INNER_WIDTH - 13;
  const displayDir =
    shortDir.length > maxDirLength ? `${shortDir.slice(0, maxDirLength - 3)}...` : shortDir;

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

  // Project info (if configured)
  const projectPrefix = ' project:   ';
  const projectName = projectConfig?.project.name ?? '';
  const orgName = projectConfig?.organization.name ?? '';
  const projectDisplay = projectConfig ? `${projectName} (${orgName})` : '';
  const maxProjectLength = INNER_WIDTH - projectPrefix.length - 1;
  const truncatedProject =
    projectDisplay.length > maxProjectLength
      ? `${projectDisplay.slice(0, maxProjectLength - 3)}...`
      : projectDisplay;
  const projectText = projectPrefix + truncatedProject;
  const projectPadding = ' '.repeat(Math.max(0, INNER_WIDTH - projectText.length));

  // Project ID
  const idPrefix = ' project_id:';
  const projectId = projectConfig?.project.id ?? '';
  const maxIdLength = INNER_WIDTH - idPrefix.length - 1;
  const truncatedId =
    projectId.length > maxIdLength ? `${projectId.slice(0, maxIdLength - 3)}...` : projectId;
  const idText = idPrefix + truncatedId;
  const idPadding = ' '.repeat(Math.max(0, INNER_WIDTH - idText.length));

  // User info
  const userPrefix = ' user:      ';
  const userName = projectConfig?.member.name ?? '';
  const userEmail = projectConfig?.member.email ?? '';
  const userDisplay = projectConfig ? `${userName} (${userEmail})` : '';
  const maxUserLength = INNER_WIDTH - userPrefix.length - 1;
  const truncatedUser =
    userDisplay.length > maxUserLength
      ? `${userDisplay.slice(0, maxUserLength - 3)}...`
      : userDisplay;
  const userText = userPrefix + truncatedUser;
  const userPadding = ' '.repeat(Math.max(0, INNER_WIDTH - userText.length));

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

      {/* Project line (if configured) */}
      {projectConfig && (
        <Box>
          <Text dimColor>│{projectPrefix}</Text>
          <Text>{truncatedProject}</Text>
          <Text>{projectPadding}</Text>
          <Text dimColor>│</Text>
        </Box>
      )}

      {/* Project ID line (if configured) */}
      {projectConfig && (
        <Box>
          <Text dimColor>│{idPrefix}</Text>
          <Text dimColor>{truncatedId}</Text>
          <Text>{idPadding}</Text>
          <Text dimColor>│</Text>
        </Box>
      )}

      {/* User line (if configured) */}
      {projectConfig && (
        <Box>
          <Text dimColor>│{userPrefix}</Text>
          <Text>{truncatedUser}</Text>
          <Text>{userPadding}</Text>
          <Text dimColor>│</Text>
        </Box>
      )}

      {/* Bottom border */}
      <Text dimColor>╰{horizontalBorder}╯</Text>
    </Box>
  );
};
