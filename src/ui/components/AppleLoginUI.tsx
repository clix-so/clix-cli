/**
 * Apple Account login UI component for Ink.
 *
 * Supports:
 * - Session restoration (skip password if already authenticated)
 * - Existing key selection with download option
 * - New key creation
 *
 * @module ui/components/AppleLoginUI
 */

import { Auth } from '@expo/apple-utils';
import { Box, Text, useStdin } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  APPLE_KEYS_TOO_MANY_ERROR,
  createPushKeyAsync,
  downloadPushKeyAsync,
  isAppleKeysTooManyErrorMessage,
  listPushKeysAsync,
  loginWithUserCredentialsAsync,
  type PushKey,
  type PushKeyStoreInfo,
  revokePushKeysAsync,
  type UserAuthContext,
} from '@/lib/ios';
import { useCancelInput } from '@/ui/hooks';

type AppleLoginPhase =
  | 'prompt_login'
  | 'apple_id_input'
  | 'restoring_session'
  | 'password_input'
  | 'logging_in'
  | 'loading_keys'
  | 'key_selection'
  | 'creating_key'
  | 'key_limit_reached'
  | 'revoking_key'
  | 'downloading_key'
  | 'success'
  | 'error';

interface AppleLoginUIProps {
  onSuccess: (result: { authContext: UserAuthContext; pushKey: PushKey }) => void;
  onCancel: () => void;
  onFallback: () => void;
}

/**
 * Interactive Apple login UI that prompts for credentials and creates push key.
 */
export const AppleLoginUI: React.FC<AppleLoginUIProps> = ({ onSuccess, onCancel, onFallback }) => {
  const [phase, setPhase] = useState<AppleLoginPhase>('prompt_login');
  const [appleId, setAppleId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const [authContext, setAuthContext] = useState<UserAuthContext | null>(null);
  const [existingKeys, setExistingKeys] = useState<PushKeyStoreInfo[]>([]);
  const [keyToRevokeId, setKeyToRevokeId] = useState<string | null>(null);
  const { isRawModeSupported, setRawMode } = useStdin();

  useCancelInput(onCancel);

  useEffect(() => {
    if (!isRawModeSupported) {
      return;
    }

    const requiresKeyboardInput =
      phase === 'prompt_login' ||
      phase === 'apple_id_input' ||
      phase === 'password_input' ||
      phase === 'key_selection' ||
      phase === 'key_limit_reached' ||
      phase === 'error';
    if (!requiresKeyboardInput) {
      return;
    }

    // expo/apple-utils auth flow can leave stdin in cooked mode.
    // Re-enable raw mode so Ink selectors receive arrow keys properly.
    setRawMode(true);
  }, [isRawModeSupported, phase, setRawMode]);

  const handleStartLogin = useCallback(() => {
    setPhase('apple_id_input');
  }, []);

  const handleManualSetup = useCallback(() => {
    onFallback();
  }, [onFallback]);

  // Try to restore session after Apple ID is submitted
  const handleAppleIdSubmit = useCallback(async () => {
    if (!appleId.trim()) {
      setError('Apple ID is required');
      return;
    }
    setError(null);
    setPhase('restoring_session');
    setStatusMessage('Checking existing session...');

    // Clear in-memory data
    Auth.resetInMemoryData();

    try {
      // Try restoring session without password
      const restoredSession = await Auth.tryRestoringAuthStateFromUserCredentialsAsync(
        { username: appleId },
        { autoResolveProvider: true },
      );

      if (restoredSession?.context.teamId) {
        // Session restored! Build auth context and load keys
        const ctx = await buildAuthContextFromSession(restoredSession, appleId);
        setAuthContext(ctx);
        setPhase('loading_keys');
        setStatusMessage('Loading existing keys...');

        const keys = await listPushKeysAsync(ctx);
        setExistingKeys(keys);
        setPhase('key_selection');
      } else {
        // No valid session, need password
        setPhase('password_input');
      }
    } catch {
      // Session restoration failed, need password
      setPhase('password_input');
    }
  }, [appleId]);

  const handlePasswordSubmit = useCallback(async () => {
    if (!password) {
      setError('Password is required');
      return;
    }
    setError(null);
    setPhase('logging_in');
    setStatusMessage('Authenticating with Apple...');

    try {
      // Create simple prompt functions for the login
      const promptAppleIdFn = async () => appleId;
      const promptPasswordFn = async () => password;
      const promptConfirmFn = async () => false;

      const ctx = await loginWithUserCredentialsAsync(
        promptAppleIdFn,
        promptPasswordFn,
        promptConfirmFn,
        {},
      );

      setAuthContext(ctx);
      setPhase('loading_keys');
      setStatusMessage('Loading existing keys...');

      const keys = await listPushKeysAsync(ctx);
      setExistingKeys(keys);
      setPhase('key_selection');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      if (message === 'ABORTED') {
        onCancel();
        return;
      }
      setError(message);
      setPhase('error');
    }
  }, [appleId, password, onCancel]);

  const handleDownloadKey = useCallback(
    async (keyId: string) => {
      if (!authContext) return;

      setPhase('downloading_key');
      setStatusMessage('Downloading key...');

      try {
        const pushKey = await downloadPushKeyAsync(authContext, keyId);
        setPhase('success');
        onSuccess({ authContext, pushKey });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to download key';
        setError(message);
        setPhase('error');
      }
    },
    [authContext, onSuccess],
  );

  const handleKeyLimitReached = useCallback(
    async (message: string) => {
      if (!authContext) {
        setError(message);
        setPhase('error');
        return;
      }

      try {
        setStatusMessage('Loading existing APNS keys...');
        const keys = await listPushKeysAsync(authContext);
        setExistingKeys(keys);
        setError(message);
        setPhase('key_limit_reached');
      } catch (listErr) {
        const listMessage =
          listErr instanceof Error ? listErr.message : 'Failed to load existing APNS keys';
        setError(`${message}\n\nAdditionally failed to load keys: ${listMessage}`);
        setPhase('error');
      }
    },
    [authContext],
  );

  const handleRevokeKeyAndRetryCreate = useCallback(
    async (keyId: string) => {
      if (!authContext) {
        setError('Authentication context missing. Please login again.');
        setPhase('error');
        return;
      }

      setKeyToRevokeId(keyId);
      setStatusMessage(`Revoking APNS key ${keyId}...`);
      setPhase('revoking_key');

      try {
        await revokePushKeysAsync(authContext, [keyId]);
        const refreshedKeys = await listPushKeysAsync(authContext);
        setExistingKeys(refreshedKeys);
        setStatusMessage('Creating new APNS key...');

        const pushKey = await createPushKeyAsync(authContext);
        setPhase('success');
        onSuccess({ authContext, pushKey });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revoke APNS key';
        if (isAppleKeysTooManyErrorMessage(message)) {
          await handleKeyLimitReached(message);
          return;
        }
        setError(message);
        setPhase('error');
      }
    },
    [authContext, handleKeyLimitReached, onSuccess],
  );

  const handleCreateNewKey = useCallback(async () => {
    if (!authContext) return;

    setPhase('creating_key');
    setStatusMessage('Creating new APNS key...');

    try {
      const pushKey = await createPushKeyAsync(authContext);
      setPhase('success');
      onSuccess({ authContext, pushKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create key';
      if (isAppleKeysTooManyErrorMessage(message)) {
        await handleKeyLimitReached(message);
        return;
      }
      setError(message);
      setPhase('error');
    }
  }, [authContext, handleKeyLimitReached, onSuccess]);

  const handleRetry = useCallback(() => {
    setError(null);
    setPassword('');
    setKeyToRevokeId(null);
    setPhase('apple_id_input');
  }, []);

  if (phase === 'prompt_login') {
    const promptItems: Array<{ label: string; value: 'login' | 'manual' }> = [
      { label: 'Log in with Apple Account', value: 'login' },
      { label: 'Manual setup (create key in browser)', value: 'manual' },
    ];

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Create APNS Key with Apple Account</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            You can create an APNS key automatically by logging in with your Apple Developer
            account.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>• Two-factor authentication may be required</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            • Your password is only used for authentication and stored locally in Keychain
          </Text>
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <SelectInput
            items={promptItems}
            onSelect={(item) => {
              if (item.value === 'login') {
                handleStartLogin();
              } else {
                handleManualSetup();
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ to navigate · Enter to select · Esc/Ctrl+C to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'apple_id_input') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Apple Developer Account Login</Text>
        </Box>
        {error && (
          <Box marginBottom={1}>
            <Text color="red">✗ {error}</Text>
          </Box>
        )}
        <Box marginBottom={1}>
          <Text>Apple ID (email): </Text>
        </Box>
        <Box>
          <Text color="blue">{'> '}</Text>
          <TextInput
            value={appleId}
            onChange={setAppleId}
            placeholder="your@email.com"
            onSubmit={handleAppleIdSubmit}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'restoring_session') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Apple Developer Account</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {statusMessage}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'password_input') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Apple Developer Account Login</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Apple ID: {appleId}</Text>
        </Box>
        {error && (
          <Box marginBottom={1}>
            <Text color="red">✗ {error}</Text>
          </Box>
        )}
        <Box marginBottom={1}>
          <Text>Password: </Text>
        </Box>
        <Box>
          <Text color="blue">{'> '}</Text>
          <TextInput
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            mask="*"
            onSubmit={handlePasswordSubmit}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Your password is stored securely in your local Keychain</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'logging_in' || phase === 'loading_keys') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Apple Developer Account</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {statusMessage}</Text>
        </Box>
        {phase === 'logging_in' && (
          <Box marginTop={1}>
            <Text dimColor>If prompted, check your device for 2FA code</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === 'key_selection' && authContext) {
    return (
      <KeySelectionPhase
        authContext={authContext}
        existingKeys={existingKeys}
        onCreateNew={handleCreateNewKey}
        onDownload={handleDownloadKey}
        onManual={handleManualSetup}
      />
    );
  }

  if (phase === 'key_limit_reached' && authContext) {
    const revocableKeys = existingKeys.filter((key) => key.canRevoke);
    const nonRevocableKeys = existingKeys.filter((key) => !key.canRevoke);
    const keyLimitItems: Array<{ label: string; value: string }> = [
      ...revocableKeys.map((key) => ({
        label: `Delete key: ${key.name} (${key.id})`,
        value: `revoke:${key.id}`,
      })),
      { label: 'Back to key options', value: 'back' },
      { label: 'Manual setup (create key in browser)', value: 'manual' },
    ];

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold color="yellow">
            APNS Key Limit Reached
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="yellow">✗ {error || APPLE_KEYS_TOO_MANY_ERROR.trim()}</Text>
        </Box>
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>Apple account key count: {existingKeys.length}</Text>
          {existingKeys.map((key) => (
            <Text key={key.id} dimColor>
              • {key.name} ({key.id}){key.canRevoke ? ' [deletable]' : ' [not deletable]'}
            </Text>
          ))}
        </Box>
        {revocableKeys.length === 0 && (
          <Box marginBottom={1}>
            <Text color="yellow">No revocable keys available. Use manual setup or go back.</Text>
          </Box>
        )}
        <Box marginBottom={1}>
          <Text bold>Select an option:</Text>
        </Box>
        <SelectInput
          items={keyLimitItems}
          onSelect={(item) => {
            if (item.value === 'manual') {
              handleManualSetup();
              return;
            }
            if (item.value === 'back') {
              setError(null);
              setKeyToRevokeId(null);
              setPhase('key_selection');
              return;
            }
            if (item.value.startsWith('revoke:')) {
              const keyId = item.value.slice('revoke:'.length);
              void handleRevokeKeyAndRetryCreate(keyId);
            }
          }}
        />
        {nonRevocableKeys.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>
              Note: some keys may require manual cleanup in Apple Developer portal.
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>↑↓ to navigate · Enter to select · Esc/Ctrl+C to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'revoking_key') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Apple Developer Account</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {statusMessage}</Text>
        </Box>
        {keyToRevokeId && (
          <Box marginTop={1}>
            <Text dimColor>Revoking key: {keyToRevokeId}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === 'creating_key' || phase === 'downloading_key') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Apple Developer Account</Text>
        </Box>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {statusMessage}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'success' && authContext) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold color="green">
            ✓ APNS Key Ready
          </Text>
        </Box>
        <Box>
          <Text dimColor>Team: </Text>
          <Text>{authContext.team.name || authContext.team.id}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'error') {
    const errorItems: Array<{ label: string; value: 'retry' | 'manual' }> = [
      { label: 'Retry login', value: 'retry' },
      { label: 'Manual setup instead', value: 'manual' },
    ];

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold color="red">
            Apple Login Error
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <SelectInput
            items={errorItems}
            onSelect={(item) => {
              if (item.value === 'retry') {
                handleRetry();
              } else {
                handleManualSetup();
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ to navigate · Enter to select · Esc/Ctrl+C to cancel</Text>
        </Box>
      </Box>
    );
  }

  return null;
};

/**
 * Key selection phase component.
 */
const KeySelectionPhase: React.FC<{
  authContext: UserAuthContext;
  existingKeys: PushKeyStoreInfo[];
  onCreateNew: () => void;
  onDownload: (keyId: string) => void;
  onManual: () => void;
}> = ({ authContext, existingKeys, onCreateNew, onDownload, onManual }) => {
  const downloadableKeys = existingKeys.filter((k) => k.canDownload);
  const hasDownloadableKeys = downloadableKeys.length > 0;

  // Build selection items
  const items: Array<{ label: string; value: string }> = [
    { label: 'Create new APNS key', value: 'create_new' },
  ];

  // Add downloadable keys
  for (const key of downloadableKeys) {
    items.push({
      label: `Download existing: ${key.name} (${key.id})`,
      value: `download:${key.id}`,
    });
  }

  items.push({ label: 'Manual setup (create key in browser)', value: 'manual' });

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'create_new') {
      onCreateNew();
    } else if (item.value === 'manual') {
      onManual();
    } else if (item.value.startsWith('download:')) {
      const keyId = item.value.replace('download:', '');
      onDownload(keyId);
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="green">
          ✓ Logged in as {authContext.appleId}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Team: {authContext.team.name || authContext.team.id}</Text>
      </Box>

      {existingKeys.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>
            Found {existingKeys.length} existing key(s)
            {hasDownloadableKeys
              ? ` (${downloadableKeys.length} downloadable)`
              : ' (none downloadable)'}
          </Text>
          {!hasDownloadableKeys && existingKeys.length > 0 && (
            <Text dimColor color="yellow">
              Note: P8 keys can only be downloaded once when created
            </Text>
          )}
        </Box>
      )}

      <Box marginBottom={1}>
        <Text bold>Select an option:</Text>
      </Box>

      <SelectInput items={items} onSelect={handleSelect} />

      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate · Enter to select · Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
};

/**
 * Build UserAuthContext from restored session.
 */
async function buildAuthContextFromSession(
  authState: { context: { teamId?: string }; username: string },
  appleId: string,
): Promise<UserAuthContext> {
  const { Teams, Session } = await import('@expo/apple-utils');

  const teamId = authState.context.teamId;
  if (!teamId) {
    throw new Error('Team ID not found in authentication state');
  }

  const teams = await Teams.getTeamsAsync();
  const team = teams.find((t) => t.teamId === teamId);

  if (!team) {
    throw new Error(`Your account is not associated with Apple Team with ID: ${teamId}`);
  }

  const fastlaneSession = Session.getSessionAsYAML();

  return {
    appleId: authState.username || appleId,
    team: {
      id: team.teamId,
      name: `${team.name} (${team.type})`,
      inHouse: team.type.toLowerCase() === 'in-house',
    },
    authState: authState as UserAuthContext['authState'],
    fastlaneSession,
  };
}
