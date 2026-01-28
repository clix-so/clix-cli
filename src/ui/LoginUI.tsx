import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { getInternalApiClient } from '@/lib/api';
import {
  type Credentials,
  createCredentials,
  getAuth0Config,
  getCredentialsManager,
  getIssuerUrl,
  openBrowser,
  PKCEFlowService,
  type TokenResponse,
} from '@/lib/auth';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';

type LoginPhase =
  | 'checking_existing'
  | 'starting_auth'
  | 'waiting_for_auth'
  | 'exchanging_code'
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
  pkceService: PKCEFlowService,
  tokenResponse?: TokenResponse,
): Promise<string> {
  try {
    const apiClient = getInternalApiClient();
    const member = await apiClient.getMe();
    return member.name || member.email;
  } catch {
    // Fall back to ID token
    if (tokenResponse?.id_token) {
      const userInfo = pkceService.parseIdToken(tokenResponse.id_token);
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
  const userName = await fetchUserName(new PKCEFlowService(config));
  return { isLoggedIn: true, userName };
}

export const LoginUI: React.FC<LoginUIProps> = ({ onComplete, onError }) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<LoginPhase>('checking_existing');
  const [browserOpened, setBrowserOpened] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const pkceServiceRef = useRef<PKCEFlowService | null>(null);

  useEffect(() => {
    const config = getAuth0Config();
    const pkceService = new PKCEFlowService(config);
    pkceServiceRef.current = pkceService;
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

        // Start PKCE flow
        setPhase('starting_auth');
        const { authUrl: url } = await pkceService.startAuthFlow();
        setAuthUrl(url);

        // Open browser
        const opened = await openBrowser(url);
        setBrowserOpened(opened);
        setPhase('waiting_for_auth');

        // Wait for callback
        const code = await pkceService.waitForCallback();

        // Exchange code for tokens
        setPhase('exchanging_code');
        const tokenResponse = await pkceService.exchangeCodeForTokens(code);

        // Save credentials
        const issuer = getIssuerUrl(config);
        const credentials = createCredentials(tokenResponse, issuer, config.audience);
        await credentialsManager.save(credentials);

        // Verify login
        setPhase('verifying');
        const name = await fetchUserName(pkceService, tokenResponse);
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

    // Cleanup on unmount
    return () => {
      pkceServiceRef.current?.abort();
    };
  }, [exit, onComplete, onError]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Login to Clix" />

      {phase === 'checking_existing' && (
        <StatusMessage type="loading" message="Checking existing credentials..." />
      )}

      {phase === 'starting_auth' && (
        <StatusMessage type="loading" message="Starting authentication..." />
      )}

      {phase === 'waiting_for_auth' && (
        <Box flexDirection="column">
          {browserOpened ? (
            <Box>
              <Text color="green">✓</Text>
              <Text> Browser opened for authentication</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color="yellow">⚠</Text>
              <Text> Could not open browser automatically.</Text>
              <Box marginTop={1}>
                <Text dimColor>Open this URL in your browser:</Text>
              </Box>
              <Box marginTop={1}>
                <Text color="cyan">{authUrl}</Text>
              </Box>
            </Box>
          )}
          <Box marginTop={2}>
            <Text dimColor>
              <Spinner type="dots" />
            </Text>
            <Text> Waiting for authentication in browser...</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press </Text>
            <Text color="gray">Ctrl+C</Text>
            <Text dimColor> to cancel</Text>
          </Box>
        </Box>
      )}

      {phase === 'exchanging_code' && (
        <StatusMessage type="loading" message="Exchanging authorization code..." />
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
