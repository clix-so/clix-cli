/**
 * Update notification component.
 *
 * Displays a notification banner when a new version is available.
 *
 * @module components/UpdateNotification
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { getUpdateCommand, type InstallationMethod } from '../../lib/services/update-service';

export interface UpdateNotificationProps {
  /** Current version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Installation method for displaying correct update command */
  installationMethod: InstallationMethod;
}

/**
 * Displays an update notification banner.
 */
export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  currentVersion,
  latestVersion,
  installationMethod,
}) => {
  const updateCommand = getUpdateCommand({ method: installationMethod, isGlobal: true });

  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      flexDirection="column"
      marginBottom={1}
    >
      <Text color="yellow" bold>
        Update available!
      </Text>
      <Text>
        {currentVersion} {'->'} <Text color="green">{latestVersion}</Text>
      </Text>
      <Text dimColor>
        Run: <Text color="cyan">{updateCommand}</Text>
      </Text>
      <Text dimColor>
        Or use: <Text color="cyan">/update</Text> to check details
      </Text>
    </Box>
  );
};
