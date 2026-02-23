import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useState } from 'react';
import type {
  AndroidApp,
  FirebaseDetectionResult,
  FirebaseProject,
  IosApp,
} from '@/lib/services/firebase';
import { OAUTH_CALLBACK_CONFIG } from '@/lib/utils/oauth';
import { useCancelInput } from '@/ui/hooks';
import { formatTerminalHyperlink } from '@/ui/utils/terminalHyperlink';
import { FirebaseStatusDisplay } from './FirebaseStatusDisplay';

export {
  hasValidFirebaseConfigFiles,
  platformNeedsAndroidWithUnknown,
  platformNeedsIosWithUnknown,
} from './firebase-detection-utils';

export interface NoAppsContext {
  noAndroidApps: boolean;
  noIosApps: boolean;
  needsAndroid: boolean;
  needsIos: boolean;
}

function DetectingPhase(): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Firebase Configuration Files</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Detecting Firebase configuration files...</Text>
      </Box>
    </Box>
  );
}

function StatusPhase({
  result,
  identifierMismatch,
  expectedIdentifiers,
  onContinue,
  onCreateAndroidForCurrentPackage,
  onCreateIosForCurrentBundle,
  onCancel,
}: {
  result: FirebaseDetectionResult;
  identifierMismatch?: { ios: boolean; android: boolean };
  expectedIdentifiers?: { iosBundleId?: string; androidPackageName?: string };
  onContinue: () => void;
  onCreateAndroidForCurrentPackage?: () => void;
  onCreateIosForCurrentBundle?: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const canCreateAndroidForCurrentPackage = Boolean(
    onCreateAndroidForCurrentPackage &&
      identifierMismatch?.android &&
      expectedIdentifiers?.androidPackageName,
  );
  const canCreateIosForCurrentBundle = Boolean(
    onCreateIosForCurrentBundle && identifierMismatch?.ios && expectedIdentifiers?.iosBundleId,
  );
  const hasCreateAction = canCreateAndroidForCurrentPackage || canCreateIosForCurrentBundle;

  useInput((_input, key) => {
    if (!hasCreateAction && key.return) {
      onContinue();
    }
  });

  useCancelInput(onCancel);

  const hasMismatch = identifierMismatch?.ios || identifierMismatch?.android;
  const detectedIosBundleId =
    result.ios?.content && 'BUNDLE_ID' in result.ios.content
      ? (result.ios.content as { BUNDLE_ID?: string }).BUNDLE_ID
      : undefined;
  const detectedAndroidPackage =
    result.android?.content && 'client' in result.android.content
      ? (
          result.android.content as {
            client?: Array<{ client_info?: { android_client_info?: { package_name?: string } } }>;
          }
        ).client
          ?.map((client) => client.client_info?.android_client_info?.package_name)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .join(', ')
      : undefined;

  const mismatchActionItems: Array<{
    label: string;
    value: 'download' | 'create_android' | 'create_ios' | 'cancel';
  }> = [{ label: '⬇ Download correct files', value: 'download' }];
  if (canCreateAndroidForCurrentPackage) {
    mismatchActionItems.push({
      label: `➕ Create Android app for current package (${expectedIdentifiers?.androidPackageName})`,
      value: 'create_android',
    });
  }
  if (canCreateIosForCurrentBundle) {
    mismatchActionItems.push({
      label: `➕ Create iOS app for current bundle ID (${expectedIdentifiers?.iosBundleId})`,
      value: 'create_ios',
    });
  }
  mismatchActionItems.push({ label: '← Back', value: 'cancel' });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <FirebaseStatusDisplay result={result} showDetails={true} />
      {identifierMismatch?.ios && expectedIdentifiers?.iosBundleId && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>
            ⚠ iOS Bundle ID mismatch
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Text color="yellow">Expected: {expectedIdentifiers.iosBundleId}</Text>
            <Text color="yellow">Found: {detectedIosBundleId ?? 'unknown'}</Text>
          </Box>
        </Box>
      )}
      {identifierMismatch?.android && expectedIdentifiers?.androidPackageName && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>
            ⚠ Android package name mismatch
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Text color="yellow">Expected: {expectedIdentifiers.androidPackageName}</Text>
            <Text color="yellow">Found: {detectedAndroidPackage ?? 'unknown'}</Text>
          </Box>
        </Box>
      )}
      <Box marginTop={1}>
        {hasCreateAction ? (
          <Box flexDirection="column">
            <Text dimColor>Choose how to resolve identifier mismatch:</Text>
            <SelectInput
              items={mismatchActionItems}
              onSelect={(item) => {
                if (item.value === 'download') {
                  onContinue();
                  return;
                }
                if (item.value === 'create_android') {
                  onCreateAndroidForCurrentPackage?.();
                  return;
                }
                if (item.value === 'create_ios') {
                  onCreateIosForCurrentBundle?.();
                  return;
                }
                onCancel();
              }}
            />
            <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
          </Box>
        ) : (
          <Text dimColor>
            {hasMismatch
              ? 'Press Enter to download correct files, Esc/Ctrl+C to cancel'
              : 'Press Enter to download required files, Esc/Ctrl+C to cancel'}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function AuthenticatingPhase({
  onCancel,
  authUrl,
}: {
  onCancel: () => void;
  authUrl?: string | null;
}): React.ReactElement {
  useCancelInput(onCancel);
  const reopenLink = authUrl ? formatTerminalHyperlink(authUrl, authUrl) : null;

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box marginBottom={1}>
          <Text bold>Firebase Authentication</Text>
        </Box>
        <Box>
          <Text dimColor>
            <Spinner type="dots" />
          </Text>
          <Text> Opening browser for Google authentication...</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Complete authentication in your browser.</Text>
        </Box>
        {reopenLink ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>If browser was closed, reopen this URL:</Text>
            <Text color="cyan">{reopenLink}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>Press Esc/Ctrl+C to cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}

function ProjectSelectorPhase({
  projects,
  onSelect,
  onCancel,
}: {
  projects: FirebaseProject[];
  onSelect: (project: FirebaseProject) => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = projects.map((project) => ({
    label: project.displayName || project.projectId,
    value: project,
  }));

  useCancelInput(onCancel);

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
        <Text bold>Select Firebase Project</Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

function AppSelectorPhase({
  apps,
  platform,
  onSelect,
  onCancel,
}: {
  apps: (AndroidApp | IosApp)[];
  platform: 'android' | 'ios';
  onSelect: (app: AndroidApp | IosApp) => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = apps.map((app) => ({
    label:
      app.displayName ||
      (platform === 'android' ? (app as AndroidApp).packageName : (app as IosApp).bundleId),
    value: app,
  }));

  useCancelInput(onCancel);

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
        <Text bold>{platform === 'android' ? 'Select Android App' : 'Select iOS App'}</Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

function DownloadingPhase({
  platform,
}: {
  platform: 'android' | 'ios' | 'both';
}): React.ReactElement {
  const message =
    platform === 'both'
      ? 'Downloading config files...'
      : platform === 'android'
        ? 'Downloading google-services.json...'
        : 'Downloading GoogleService-Info.plist...';

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
        <Text bold>Firebase Download</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> {message}</Text>
      </Box>
    </Box>
  );
}

function NoAppsFoundPhase({
  context,
  onCreateAndroid,
  onCreateIos,
  onCancel,
}: {
  context: NoAppsContext;
  onCreateAndroid: () => void;
  onCreateIos: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const items: Array<{ label: string; value: string }> = [];

  if (context.noAndroidApps && context.needsAndroid) {
    items.push({
      label: '➕ Create Android app',
      value: 'create_android',
    });
  }

  if (context.noIosApps && context.needsIos) {
    items.push({
      label: '➕ Create iOS app',
      value: 'create_ios',
    });
  }

  items.push({
    label: '← Back',
    value: 'cancel',
  });

  useCancelInput(onCancel);

  const handleSelect = (item: { value: string }) => {
    switch (item.value) {
      case 'create_android':
        onCreateAndroid();
        break;
      case 'create_ios':
        onCreateIos();
        break;
      default:
        onCancel();
        break;
    }
  };

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
          No Apps Found
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>No apps are registered in this Firebase project.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Would you like to create a new app?</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

function CreateAppInputPhase({
  platform,
  defaultIdentifier,
  onSubmit,
  onCancel,
}: {
  platform: 'android' | 'ios';
  defaultIdentifier?: string;
  onSubmit: (identifier: string, displayName?: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [identifier, setIdentifier] = useState(defaultIdentifier ?? '');
  const [displayName, setDisplayName] = useState('');
  const [stage, setStage] = useState<'identifier' | 'display_name'>('identifier');

  useCancelInput(onCancel);

  const handleIdentifierSubmit = useCallback(() => {
    if (identifier.trim()) {
      setStage('display_name');
    }
  }, [identifier]);

  const handleDisplayNameSubmit = useCallback(() => {
    onSubmit(identifier.trim(), displayName.trim() || undefined);
  }, [displayName, identifier, onSubmit]);

  const isAndroid = platform === 'android';
  const identifierLabel = isAndroid ? 'Package Name' : 'Bundle ID';

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
        <Text bold>{isAndroid ? 'Create Android App' : 'Create iOS App'}</Text>
      </Box>

      {stage === 'identifier' ? (
        <>
          <Box marginBottom={1}>
            <Text>{identifierLabel}: </Text>
            <Text dimColor>(e.g., com.example.app)</Text>
          </Box>
          <Box>
            <Text color="blue">{'>'} </Text>
            <TextInput
              value={identifier}
              onChange={setIdentifier}
              placeholder="com.example.app"
              onSubmit={handleIdentifierSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to continue · Esc/Ctrl+C cancel</Text>
          </Box>
        </>
      ) : (
        <>
          <Box marginBottom={1}>
            <Text dimColor>
              {identifierLabel}: {identifier}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Display Name: </Text>
            <Text dimColor>(optional)</Text>
          </Box>
          <Box>
            <Text color="blue">{'>'} </Text>
            <TextInput
              value={displayName}
              onChange={setDisplayName}
              placeholder="My App"
              onSubmit={handleDisplayNameSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to create · Esc/Ctrl+C cancel</Text>
          </Box>
        </>
      )}
    </Box>
  );
}

function CreatingAppPhase({ platform }: { platform: 'android' | 'ios' }): React.ReactElement {
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
        <Text bold>Firebase App Creation</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> {platform === 'android' ? 'Creating Android app...' : 'Creating iOS app...'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>This may take a few seconds...</Text>
      </Box>
    </Box>
  );
}

function NoProjectsPhase({
  onOpenProjectCreation,
  onRetry,
  onCancel,
}: {
  onOpenProjectCreation: () => void;
  onRetry: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = [
    { label: '🆕 Open Firebase Project Creation', value: 'create' },
    { label: '↻ Retry project list', value: 'retry' },
    { label: '← Back', value: 'cancel' },
  ];

  useCancelInput(onCancel);

  const handleSelect = (item: { value: string }) => {
    switch (item.value) {
      case 'create':
        onOpenProjectCreation();
        break;
      case 'retry':
        onRetry();
        break;
      default:
        onCancel();
        break;
    }
  };

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
          No Firebase Projects Found
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>No Firebase projects are associated with this account.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Create a project in browser, then retry project list.</Text>
      </Box>
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>1) Open Firebase Project Creation</Text>
        <Text dimColor>2) Complete project creation in browser</Text>
        <Text dimColor>3) Return here and choose Retry project list</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

function isScopeInsufficientError(error: string): boolean {
  return (
    error.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    error.includes('insufficient authentication scopes') ||
    (error.includes('403') && error.includes('PERMISSION_DENIED'))
  );
}

function getErrorHint(error: string): string | null {
  if (isScopeInsufficientError(error)) {
    return `Your OAuth token has insufficient permissions.
This usually happens when the required permissions have changed.
Press Enter to re-authenticate with updated permissions.`;
  }

  if (error.includes('invalid_client')) {
    return 'The OAuth client ID is invalid. Check your CLIX_GOOGLE_CLIENT_ID setting.';
  }

  if (error.includes('redirect_uri_mismatch')) {
    return `OAuth redirect URI mismatch. Add this callback URL: ${OAUTH_CALLBACK_CONFIG.getCallbackUrlIp()}`;
  }

  if (error.includes('invalid_request')) {
    return 'OAuth request failed. Check .clix/debug.log for details.';
  }

  if (error.includes('API has not been used in project') || error.includes('it is disabled')) {
    return 'A required Google Cloud API is disabled. Enable the API in Google Cloud Console and retry.';
  }

  return null;
}

export {
  AppSelectorPhase as FirebaseConfigAppSelectorTask,
  AuthenticatingPhase as FirebaseConfigAuthenticatingTask,
  CreateAppInputPhase as FirebaseConfigCreateAppInputTask,
  CreatingAppPhase as FirebaseConfigCreatingAppTask,
  DetectingPhase as FirebaseConfigDetectingTask,
  DownloadingPhase as FirebaseConfigDownloadingTask,
  ErrorPhase as FirebaseConfigErrorTask,
  NoAppsFoundPhase as FirebaseConfigNoAppsFoundTask,
  NoProjectsPhase as FirebaseConfigNoProjectsTask,
  ProjectSelectorPhase as FirebaseConfigProjectSelectorTask,
  StatusPhase as FirebaseConfigStatusTask,
};

function ErrorPhase({
  error,
  onRetry,
  onCancel,
}: {
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onRetry();
    }
  });

  useCancelInput(onCancel);

  const hint = getErrorHint(error);

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
          Firebase Configuration Error
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="red">✗ {error}</Text>
      </Box>
      {hint ? (
        <Box marginBottom={1}>
          <Text color="yellow">{hint}</Text>
        </Box>
      ) : (
        <Box marginBottom={1}>
          <Text dimColor>See .clix/debug.log for details.</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>Press Enter to retry, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}
