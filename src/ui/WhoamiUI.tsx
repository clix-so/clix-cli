import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { getInternalApiClient, type Member } from '@/lib/api';
import { AUTH_ENV_VARS, getCredentialsManager } from '@/lib/auth';
import { getConfigManager, type LinkedProject } from '@/lib/config';
import { imageToAscii } from '@/lib/utils/ascii-image';
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

/** Check if using environment variable authentication */
function checkEnvAuth(): boolean {
  return !!process.env[AUTH_ENV_VARS.ACCESS_TOKEN];
}

/** Fetch profile image as ASCII art */
async function fetchProfileAscii(profileImageUrl: string | undefined): Promise<string | null> {
  if (!profileImageUrl) return null;
  return imageToAscii(profileImageUrl, { width: 18, color: true });
}

/** Get linked project for workspace */
async function getLinkedProject(workspacePath: string): Promise<LinkedProject | null> {
  try {
    const configManager = getConfigManager();
    const config = await configManager.load();
    return config.workspaces?.[workspacePath] ?? null;
  } catch {
    return null;
  }
}

/** Schedule exit for CLI mode */
function scheduleExitIfCli(onComplete: WhoamiUIProps['onComplete'], exit: () => void): void {
  if (!onComplete) {
    setTimeout(() => exit(), 100);
  }
}

export const WhoamiUI: React.FC<WhoamiUIProps> = ({ onComplete }) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<WhoamiPhase>('loading');
  const [member, setMember] = useState<Member | null>(null);
  const [linkedProject, setLinkedProject] = useState<LinkedProject | null>(null);
  const [workspacePath] = useState(() => process.cwd());
  const [isEnvAuth, setIsEnvAuth] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<WhoamiResult | null>(null);
  const [profileAscii, setProfileAscii] = useState<string | null>(null);

  // Handle keypress to dismiss in interactive mode
  const isInteractiveMode = !!onComplete;
  const isWaitingForKey = isInteractiveMode && phase !== 'loading';

  useInput(
    () => {
      if (isWaitingForKey && result) {
        onComplete(result);
      }
    },
    { isActive: isWaitingForKey },
  );

  useEffect(() => {
    const runWhoami = async () => {
      try {
        setIsEnvAuth(checkEnvAuth());

        const credentialsManager = getCredentialsManager();
        const token = await credentialsManager.getValidToken();

        if (!token) {
          setPhase('not_logged_in');
          setResult({ status: 'not_logged_in' });
          scheduleExitIfCli(onComplete, exit);
          return;
        }

        const apiClient = getInternalApiClient();
        const memberInfo = await apiClient.getMe();
        setMember(memberInfo);

        const ascii = await fetchProfileAscii(memberInfo.profile_image_url);
        if (ascii) setProfileAscii(ascii);

        const linked = await getLinkedProject(workspacePath);
        if (linked) setLinkedProject(linked);

        setPhase('complete');
        setResult({ status: 'ok', member: memberInfo });
        scheduleExitIfCli(onComplete, exit);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch user info';
        setErrorMessage(message);
        setPhase('error');
        setResult({ status: 'error', message });
        scheduleExitIfCli(onComplete, exit);
      }
    };

    runWhoami();
  }, [exit, onComplete, workspacePath]);

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
            {linkedProject ? (
              <>
                <Box>
                  <Text dimColor>Organization: </Text>
                  <Text>{linkedProject.organizationName}</Text>
                </Box>
                <Box>
                  <Text dimColor>Project: </Text>
                  <Text color="cyan">{linkedProject.projectName}</Text>
                </Box>
              </>
            ) : (
              <Box flexDirection="column">
                <Text dimColor>No project linked to this workspace.</Text>
                <Box marginTop={1}>
                  <Text dimColor>Run </Text>
                  <Text color="cyan">clix login</Text>
                  <Text dimColor> to link a project.</Text>
                </Box>
              </Box>
            )}
            <Box marginTop={linkedProject ? 1 : 0}>
              <Text dimColor>Member ID: </Text>
              <Text dimColor>{member.id}</Text>
            </Box>
            <Box>
              <Text dimColor>Name: </Text>
              <Text bold>{member.name}</Text>
            </Box>
            <Box>
              <Text dimColor>Email: </Text>
              <Text>{member.email}</Text>
            </Box>
            {profileAscii && (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>Profile:</Text>
                <Box marginTop={1}>
                  <Text>{profileAscii}</Text>
                </Box>
              </Box>
            )}
          </Box>
          {isInteractiveMode && (
            <Box marginTop={1}>
              <Text dimColor>Press any key to continue</Text>
            </Box>
          )}
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
          {isInteractiveMode && (
            <Box marginTop={1}>
              <Text dimColor>Press any key to continue</Text>
            </Box>
          )}
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
          {isInteractiveMode && (
            <Box marginTop={1}>
              <Text dimColor>Press any key to continue</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
