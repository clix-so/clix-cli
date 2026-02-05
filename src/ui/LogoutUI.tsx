import { Box, Text, useApp } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';

import { getCredentialsManager } from '@/lib/auth';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';

type LogoutPhase = 'checking' | 'deleting' | 'complete' | 'not_logged_in' | 'error';

export interface LogoutUIProps {
  onComplete?: (success: boolean) => void;
}

export const LogoutUI: React.FC<LogoutUIProps> = ({ onComplete }) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<LogoutPhase>('checking');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const runLogout = async () => {
      try {
        const credentialsManager = getCredentialsManager();

        // Check if logged in
        setPhase('checking');
        const credentials = await credentialsManager.load();

        if (!credentials?.clix) {
          setPhase('not_logged_in');
          setTimeout(() => {
            if (onComplete) {
              onComplete(true);
            } else {
              exit();
            }
          }, 1500);
          return;
        }

        // Clear Clix credentials only (preserve Firebase tokens)
        setPhase('deleting');
        await credentialsManager.clearClixCredentials();

        setPhase('complete');
        setTimeout(() => {
          if (onComplete) {
            onComplete(true);
          } else {
            exit();
          }
        }, 1500);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to remove credentials');
        setPhase('error');
        setTimeout(() => {
          if (onComplete) {
            onComplete(false);
          } else {
            exit();
          }
        }, 2000);
      }
    };

    runLogout();
  }, [exit, onComplete]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Logout from Clix" />

      {phase === 'checking' && <StatusMessage type="loading" message="Checking credentials..." />}

      {phase === 'deleting' && <StatusMessage type="loading" message="Removing credentials..." />}

      {phase === 'complete' && (
        <Box>
          <Text color="green" bold>
            ✓
          </Text>
          <Text> Successfully logged out.</Text>
        </Box>
      )}

      {phase === 'not_logged_in' && (
        <Box>
          <Text dimColor>You are not logged in.</Text>
        </Box>
      )}

      {phase === 'error' && <StatusMessage type="error" message={errorMessage} />}
    </Box>
  );
};
