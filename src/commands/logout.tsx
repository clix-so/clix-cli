import { Box, render, Text, useApp } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';

import { getCredentialsManager } from '../lib/auth';
import { Header } from '../ui/components/Header';
import { StatusMessage } from '../ui/components/StatusMessage';
import { printFinalOutput } from '../ui/utils/finalOutput';

type LogoutPhase = 'checking' | 'deleting' | 'complete' | 'not_logged_in' | 'error';

interface LogoutUIProps {
  onComplete?: (success: boolean) => void;
}

const LogoutUI: React.FC<LogoutUIProps> = ({ onComplete }) => {
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

        if (!credentials) {
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

        // Delete credentials
        setPhase('deleting');
        await credentialsManager.delete();

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

/**
 * Logout command - removes stored credentials
 *
 * Usage: clix logout
 */
export async function logoutCommand(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <LogoutUI
        onComplete={(success) => {
          unmount();
          if (success) {
            printFinalOutput({
              type: 'success',
              title: 'Logged out',
              message: 'Credentials have been removed',
            });
          } else {
            printFinalOutput({
              type: 'error',
              title: 'Logout failed',
              message: 'Failed to remove credentials',
            });
            process.exitCode = 1;
          }
          resolve();
        }}
      />,
      { incrementalRendering: true },
    );
  });
}
