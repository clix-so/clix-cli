import { Box, Text } from 'ink';
import type React from 'react';

interface DeviceCodeDisplayProps {
  /** User code to display */
  userCode: string;
  /** Verification URL */
  verificationUri: string;
  /** Whether browser was opened automatically */
  browserOpened: boolean;
}

/**
 * Displays device authorization code and verification URL.
 * Used during Auth0 Device Flow login.
 */
export const DeviceCodeDisplay: React.FC<DeviceCodeDisplayProps> = ({
  userCode,
  verificationUri,
  browserOpened,
}) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text>Your verification code:</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        marginLeft={2}
        alignSelf="flex-start"
      >
        <Text bold color="cyan">
          {userCode}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {browserOpened ? (
          <Box flexDirection="column">
            <Text dimColor>Browser opened automatically.</Text>
            <Text dimColor>If it didn't open, visit:</Text>
          </Box>
        ) : (
          <Text dimColor>Open this URL in your browser:</Text>
        )}
        <Box marginTop={1} marginLeft={2}>
          <Text color="blue" underline>
            {verificationUri}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter the code above and complete authentication in the browser.</Text>
      </Box>
    </Box>
  );
};
