import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useEffect, useState } from 'react';
import { getInternalApiClient } from '@/lib/api';
import {
  type Credentials,
  createCredentials,
  type DeviceCodeResponse,
  DeviceFlowService,
  getAuth0Config,
  getCredentialsManager,
  getIssuerUrl,
  openBrowser,
  type TokenResponse,
} from '@/lib/auth';
import { DeviceCodeDisplay } from '@/ui/components/DeviceCodeDisplay';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';

type LoginPhase =
  | 'checking_existing'
  | 'requesting_code'
  | 'waiting_for_auth'
  | 'saving_credentials'
  | 'verifying'
  | 'complete'
  | 'error';

interface LoginUIProps {
  /** Called when login completes successfully */
  onComplete?: (credentials: Credentials) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/** Fetch user name from API or ID token */
async function fetchUserName(
  deviceFlowService: DeviceFlowService,
  tokenResponse?: TokenResponse,
): Promise<string> {
  try {
    const apiClient = getInternalApiClient();
    const member = await apiClient.getMe();
    return member.name || member.email;
  } catch {
    // Fall back to ID token
    if (tokenResponse?.id_token) {
      const userInfo = deviceFlowService.parseIdToken(tokenResponse.id_token);
      if (userInfo) {
        return userInfo.name ?? userInfo.email ?? '';
      }
    }
    return '';
  }
}

/** Check if user is already logged in with valid credentials */
async function checkExistingLogin(): Promise<{ isLoggedIn: boolean; userName: string }> {
  const credentialsManager = getCredentialsManager();
  const existingToken = await credentialsManager.getValidToken();

  if (!existingToken) {
    return { isLoggedIn: false, userName: '' };
  }

  // Token exists - user is logged in. Try to fetch userName but don't fail login on error.
  const config = getAuth0Config();
  const userName = await fetchUserName(new DeviceFlowService(config));
  return { isLoggedIn: true, userName };
}

/** Perform device flow login and save credentials */
async function performDeviceFlowLogin(
  deviceFlowService: DeviceFlowService,
  onDeviceCode: (code: DeviceCodeResponse, browserOpened: boolean) => void,
): Promise<{ credentials: Credentials; tokenResponse: TokenResponse }> {
  const codeResponse = await deviceFlowService.requestDeviceCode();
  const browserOpened = await openBrowser(codeResponse.verification_uri_complete);
  onDeviceCode(codeResponse, browserOpened);

  const tokenResponse = await deviceFlowService.pollForToken(
    codeResponse.device_code,
    codeResponse.interval,
    codeResponse.expires_in,
  );

  const config = getAuth0Config();
  const issuer = getIssuerUrl(config);
  const credentials = createCredentials(tokenResponse, issuer, config.audience);

  const credentialsManager = getCredentialsManager();
  await credentialsManager.save(credentials);

  return { credentials, tokenResponse };
}

export const LoginUI: React.FC<LoginUIProps> = ({ onComplete, onError }) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<LoginPhase>('checking_existing');
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const config = getAuth0Config();
    const deviceFlowService = new DeviceFlowService(config);
    const credentialsManager = getCredentialsManager();

    const runLogin = async () => {
      try {
        // Check existing credentials
        setPhase('checking_existing');
        const existing = await checkExistingLogin();
        if (existing.isLoggedIn) {
          setUserName(existing.userName);
          setPhase('complete');
          setTimeout(() => {
            const creds = credentialsManager.credentials;
            if (onComplete && creds) {
              onComplete(creds);
            } else {
              exit();
            }
          }, 1500);
          return;
        }

        // Perform device flow
        setPhase('requesting_code');
        const onDeviceCode = (code: DeviceCodeResponse, opened: boolean) => {
          setDeviceCode(code);
          setBrowserOpened(opened);
          setPhase('waiting_for_auth');
        };

        const { credentials, tokenResponse } = await performDeviceFlowLogin(
          deviceFlowService,
          onDeviceCode,
        );

        // Verify login
        setPhase('verifying');
        const name = await fetchUserName(deviceFlowService, tokenResponse);
        setUserName(name);

        setPhase('complete');
        setTimeout(() => {
          if (onComplete) {
            onComplete(credentials);
          } else {
            exit();
          }
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed';
        setErrorMessage(message);
        setPhase('error');
        if (onError) {
          onError(error instanceof Error ? error : new Error(message));
        } else {
          setTimeout(() => exit(), 2000);
        }
      }
    };

    runLogin();
  }, [exit, onComplete, onError]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Login to Clix" />

      {phase === 'checking_existing' && (
        <StatusMessage type="loading" message="Checking existing credentials..." />
      )}

      {phase === 'requesting_code' && (
        <StatusMessage type="loading" message="Requesting authorization code..." />
      )}

      {phase === 'waiting_for_auth' && deviceCode && (
        <Box flexDirection="column">
          <DeviceCodeDisplay
            userCode={deviceCode.user_code}
            verificationUri={deviceCode.verification_uri}
            browserOpened={browserOpened}
          />
          <Box marginTop={2}>
            <Text dimColor>
              <Spinner type="dots" />
            </Text>
            <Text> Waiting for authentication...</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press </Text>
            <Text color="gray">Ctrl+C</Text>
            <Text dimColor> to cancel</Text>
          </Box>
        </Box>
      )}

      {phase === 'saving_credentials' && (
        <StatusMessage type="loading" message="Saving credentials..." />
      )}

      {phase === 'verifying' && <StatusMessage type="loading" message="Verifying login..." />}

      {phase === 'complete' && (
        <Box flexDirection="column">
          <Box>
            <Text color="green" bold>
              ✓
            </Text>
            <Text> Successfully logged in!</Text>
          </Box>
          {userName && (
            <Box marginTop={1} marginLeft={2}>
              <Text dimColor>Welcome, </Text>
              <Text bold>{userName}</Text>
            </Box>
          )}
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <StatusMessage type="error" message={errorMessage} />
          <Box marginTop={1}>
            <Text dimColor>Please try again with </Text>
            <Text color="cyan">clix login</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
