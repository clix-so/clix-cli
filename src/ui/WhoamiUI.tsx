import { Box, Text, useApp } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { getInternalApiClient, type Member } from '@/lib/api';
import { AUTH_ENV_VARS, getCredentialsManager } from '@/lib/auth';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';

type WhoamiPhase = 'loading' | 'complete' | 'not_logged_in' | 'error';

export type WhoamiResult =
  | { status: 'ok'; member: Member }
  | { status: 'not_logged_in' }
  | { status: 'error'; message: string };

export interface WhoamiUIProps {
  onComplete?: (result: WhoamiResult) => void;
}

export const WhoamiUI: React.FC<WhoamiUIProps> = ({ onComplete }) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<WhoamiPhase>('loading');
  const [member, setMember] = useState<Member | null>(null);
  const [isEnvAuth, setIsEnvAuth] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const runWhoami = async () => {
      try {
        const credentialsManager = getCredentialsManager();

        // Check for environment variable auth
        const envToken = process.env[AUTH_ENV_VARS.ACCESS_TOKEN];
        if (envToken) {
          setIsEnvAuth(true);
        }

        // Get valid token
        const token = await credentialsManager.getValidToken();

        if (!token) {
          setPhase('not_logged_in');
          setTimeout(() => {
            if (onComplete) {
              onComplete({ status: 'not_logged_in' });
            } else {
              exit();
            }
          }, 1500);
          return;
        }

        // Fetch user info from API
        const apiClient = getInternalApiClient();
        const memberInfo = await apiClient.getMe();
        setMember(memberInfo);
        setPhase('complete');
        setTimeout(() => {
          if (onComplete) {
            onComplete({ status: 'ok', member: memberInfo });
          } else {
            exit();
          }
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch user info';
        setErrorMessage(message);
        setPhase('error');
        setTimeout(() => {
          if (onComplete) {
            onComplete({ status: 'error', message });
          } else {
            exit();
          }
        }, 2000);
      }
    };

    runWhoami();
  }, [exit, onComplete]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Current User" />

      {phase === 'loading' && <StatusMessage type="loading" message="Fetching user info..." />}

      {phase === 'complete' && member && (
        <Box flexDirection="column">
          {isEnvAuth && (
            <Box marginBottom={1}>
              <Text dimColor>Authenticated via environment variable</Text>
            </Box>
          )}
          <Box flexDirection="column" marginLeft={2}>
            <Box>
              <Text dimColor>Name: </Text>
              <Text bold>{member.name}</Text>
            </Box>
            <Box>
              <Text dimColor>Email: </Text>
              <Text>{member.email}</Text>
            </Box>
            <Box>
              <Text dimColor>ID: </Text>
              <Text dimColor>{member.id}</Text>
            </Box>
            {member.profile_image_url && (
              <Box>
                <Text dimColor>Profile: </Text>
                <Text color="blue" underline>
                  {member.profile_image_url}
                </Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {phase === 'not_logged_in' && (
        <Box flexDirection="column">
          <Text dimColor>Not logged in.</Text>
          <Box marginTop={1}>
            <Text dimColor>Run </Text>
            <Text color="cyan">clix login</Text>
            <Text dimColor> to authenticate.</Text>
          </Box>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <StatusMessage type="error" message={errorMessage} />
          <Box marginTop={1}>
            <Text dimColor>Try </Text>
            <Text color="cyan">clix login</Text>
            <Text dimColor> to re-authenticate.</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
