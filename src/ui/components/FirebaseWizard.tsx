import { spawn } from 'node:child_process';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AndroidApp,
  type CredentialAction,
  FIREBASE_HELP_URLS,
  type FirebaseDetectionResult,
  FirebaseDownloader,
  type FirebaseProject,
  FirebaseService,
  type FirebaseSetupResult,
  type IosApp,
  isOAuthConfigured,
  platformNeedsAndroid,
  platformNeedsIos,
  type WizardPhase,
} from '@/lib/services/firebase';
import { OAUTH_CALLBACK_CONFIG } from '@/lib/utils/oauth';
import { FirebaseStatusDisplay } from './FirebaseStatusDisplay';
import { GenericSelector, type SelectorItem } from './GenericSelector';

interface FirebaseWizardProps {
  projectPath: string;
  onComplete: (result: FirebaseSetupResult) => void;
  onCancel?: () => void;
}

interface MenuAction extends SelectorItem {
  action: CredentialAction;
}

/**
 * Extended wizard phase for download flow.
 */
type ExtendedWizardPhase =
  | WizardPhase
  | 'authenticating'
  | 'select_project'
  | 'select_android_app'
  | 'select_ios_app'
  | 'downloading'
  | 'no_apps_found'
  | 'create_android_app'
  | 'create_ios_app'
  | 'creating_app';

/**
 * No apps found context (which platform apps are missing).
 */
interface NoAppsContext {
  noAndroidApps: boolean;
  noIosApps: boolean;
  needsAndroid: boolean;
  needsIos: boolean;
}

/**
 * Check if a platform needs Android config (including unknown platform).
 */
function platformNeedsAndroidWithUnknown(platform: FirebaseDetectionResult['platform']): boolean {
  return platformNeedsAndroid(platform) || platform === 'unknown';
}

/**
 * Check if a platform needs iOS config (including unknown platform).
 */
function platformNeedsIosWithUnknown(platform: FirebaseDetectionResult['platform']): boolean {
  return platformNeedsIos(platform) || platform === 'unknown';
}

/**
 * Build menu items based on detection result.
 */
function buildMenuItems(result: FirebaseDetectionResult): MenuAction[] {
  const items: MenuAction[] = [];

  const needsAndroid = platformNeedsAndroidWithUnknown(result.platform);
  const needsIos = platformNeedsIosWithUnknown(result.platform);

  // For unknown platform, show download option if either config is missing
  const hasMissingConfigs =
    result.platform === 'unknown'
      ? !result.android?.valid || !result.ios?.valid
      : (needsAndroid && !result.android?.valid) || (needsIos && !result.ios?.valid);

  // Download from Firebase option (if OAuth is configured and configs are missing)
  if (hasMissingConfigs && isOAuthConfigured()) {
    items.push({
      id: 'download',
      label: '⬇ Download from Firebase',
      description: 'Authenticate with Google and download config files',
      action: { type: 'download' },
    });
  }

  // Android actions
  if (needsAndroid) {
    if (!result.android?.valid) {
      items.push({
        id: 'redetect-android',
        label: 'Re-detect google-services.json',
        description: result.android ? 'File found but invalid' : 'File not found',
        action: { type: 'redetect_platform', platform: 'android' },
      });
    }
    if (result.android) {
      items.push({
        id: 'validate-android',
        label: 'Validate google-services.json',
        action: { type: 'validate', platform: 'android' },
      });
    }
    items.push({
      id: 'help-android',
      label: 'Help: Download google-services.json',
      action: { type: 'help', topic: 'downloadConfig' },
    });
  }

  // iOS actions
  if (needsIos) {
    if (!result.ios?.valid) {
      items.push({
        id: 'redetect-ios',
        label: 'Re-detect GoogleService-Info.plist',
        description: result.ios ? 'File found but invalid' : 'File not found',
        action: { type: 'redetect_platform', platform: 'ios' },
      });
    }
    if (result.ios) {
      items.push({
        id: 'validate-ios',
        label: 'Validate GoogleService-Info.plist',
        action: { type: 'validate', platform: 'ios' },
      });
    }
    items.push({
      id: 'help-ios',
      label: 'Help: Download GoogleService-Info.plist',
      action: { type: 'help', topic: 'downloadConfig' },
    });
  }

  // General actions
  items.push({
    id: 'redetect-all',
    label: 'Re-detect all Firebase files',
    action: { type: 'redetect' },
  });

  items.push({
    id: 'skip',
    label: 'Skip Firebase setup',
    description: 'Continue without Firebase configuration',
    action: { type: 'skip' },
  });

  if (result.configured) {
    items.push({
      id: 'done',
      label: 'Done',
      description: 'Firebase is configured',
      action: { type: 'done' },
    });
  }

  return items;
}

/**
 * Open URL in default browser.
 * Uses spawn with argument array to prevent shell injection.
 */
function openBrowser(url: string): void {
  const platform = process.platform;

  let command: string;
  let args: string[];

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    // Windows 'start' requires empty title as first arg for URLs
    command = 'cmd';
    args = ['/c', 'start', '""', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Authenticating phase component.
 */
function AuthenticatingPhase({ onCancel }: { onCancel: () => void }): React.ReactElement {
  useInput((input, key) => {
    const isCtrlC = (input === 'c' && key.ctrl) || input === '\x03';
    if (key.escape || isCtrlC) {
      onCancel();
    }
  });

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
        <Text bold>Firebase Authentication</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Opening browser for Google authentication...</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Complete the authentication in your browser.</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Project selector component.
 */
function ProjectSelector({
  projects,
  onSelect,
  onCancel,
}: {
  projects: FirebaseProject[];
  onSelect: (project: FirebaseProject) => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = projects.map((p) => ({
    label: p.displayName || p.projectId,
    value: p,
  }));

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

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
        <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * App selector component.
 */
function AppSelector({
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

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const title = platform === 'android' ? 'Select Android App' : 'Select iOS App';

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
        <Text bold>{title}</Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Downloading phase component.
 */
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

/**
 * No apps found phase component - offers to create apps.
 */
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

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSelect = (item: { value: string }) => {
    switch (item.value) {
      case 'create_android':
        onCreateAndroid();
        break;
      case 'create_ios':
        onCreateIos();
        break;
      case 'cancel':
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
        <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Create app input phase component.
 */
function CreateAppInputPhase({
  platform,
  onSubmit,
  onCancel,
}: {
  platform: 'android' | 'ios';
  onSubmit: (identifier: string, displayName?: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stage, setStage] = useState<'identifier' | 'displayName'>('identifier');

  const isAndroid = platform === 'android';
  const identifierLabel = isAndroid ? 'Package Name' : 'Bundle ID';
  const identifierPlaceholder = isAndroid ? 'com.example.app' : 'com.example.app';
  const title = isAndroid ? 'Create Android App' : 'Create iOS App';

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleIdentifierSubmit = useCallback(() => {
    if (identifier.trim()) {
      setStage('displayName');
    }
  }, [identifier]);

  const handleDisplayNameSubmit = useCallback(() => {
    onSubmit(identifier.trim(), displayName.trim() || undefined);
  }, [identifier, displayName, onSubmit]);

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
        <Text bold>{title}</Text>
      </Box>

      {stage === 'identifier' ? (
        <>
          <Box marginBottom={1}>
            <Text>
              {identifierLabel}: <Text dimColor>(e.g., {identifierPlaceholder})</Text>
            </Text>
          </Box>
          <Box>
            <Text color="blue">{'> '}</Text>
            <TextInput
              value={identifier}
              onChange={setIdentifier}
              placeholder={identifierPlaceholder}
              onSubmit={handleIdentifierSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to continue · Esc cancel</Text>
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
            <Text>
              Display Name: <Text dimColor>(optional)</Text>
            </Text>
          </Box>
          <Box>
            <Text color="blue">{'> '}</Text>
            <TextInput
              value={displayName}
              onChange={setDisplayName}
              placeholder="My App"
              onSubmit={handleDisplayNameSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter to create · Esc cancel</Text>
          </Box>
        </>
      )}
    </Box>
  );
}

/**
 * Creating app phase component.
 */
function CreatingAppPhase({ platform }: { platform: 'android' | 'ios' }): React.ReactElement {
  const message = platform === 'android' ? 'Creating Android app...' : 'Creating iOS app...';

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
        <Text> {message}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>This may take a few seconds...</Text>
      </Box>
    </Box>
  );
}

/**
 * Detecting phase component.
 */
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
        <Text bold>Firebase Configuration</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Detecting Firebase credentials...</Text>
      </Box>
    </Box>
  );
}

/**
 * Status phase component.
 */
function StatusPhase({
  result,
  onContinue,
  onSkip,
}: {
  result: FirebaseDetectionResult;
  onContinue: () => void;
  onSkip: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    } else if (key.escape) {
      onSkip();
    }
  });

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
      <Box marginTop={1}>
        <Text dimColor>Press Enter to configure, Esc to skip</Text>
      </Box>
    </Box>
  );
}

/**
 * Menu phase component.
 */
function MenuPhase({
  result,
  onAction,
  onCancel,
}: {
  result: FirebaseDetectionResult;
  onAction: (action: CredentialAction) => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = buildMenuItems(result);

  const handleSelect = useCallback(
    (item: MenuAction) => {
      onAction(item.action);
    },
    [onAction],
  );

  return (
    <GenericSelector
      items={items}
      title="Firebase Configuration"
      onSelect={handleSelect}
      onCancel={onCancel}
      helpText="↑↓ navigate · Enter select · Esc cancel"
    />
  );
}

/**
 * Validating phase component.
 */
function ValidatingPhase({ platform }: { platform: 'android' | 'ios' }): React.ReactElement {
  const fileName = platform === 'android' ? 'google-services.json' : 'GoogleService-Info.plist';

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
        <Text bold>Firebase Configuration</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Validating {fileName}...</Text>
      </Box>
    </Box>
  );
}

/**
 * Check if an error is a scope insufficient error.
 */
function isScopeInsufficientError(error: string): boolean {
  return (
    error.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    error.includes('insufficient authentication scopes') ||
    (error.includes('403') && error.includes('PERMISSION_DENIED'))
  );
}

/**
 * Get helpful hint message based on error type.
 */
function getErrorHint(error: string): string | null {
  if (isScopeInsufficientError(error)) {
    return `Your OAuth token has insufficient permissions.
This usually happens when the required permissions have changed.
Press Enter to re-authenticate with updated permissions.`;
  }
  if (error.includes('invalid_client')) {
    return `The OAuth client ID is invalid or not configured correctly.
Check your CLIX_GOOGLE_CLIENT_ID environment variable.`;
  }
  if (error.includes('redirect_uri_mismatch')) {
    return `The redirect URI doesn't match your OAuth client configuration.
Add this to your OAuth client: ${OAUTH_CALLBACK_CONFIG.getCallbackUrlIp()}`;
  }
  if (error.includes('invalid_grant')) {
    return `The authorization code has expired or already been used.
Please try again.`;
  }
  return null;
}

/**
 * Error phase component.
 */
function ErrorPhase({
  error,
  onRetry,
  onSkip,
}: {
  error: string;
  onRetry: () => void;
  onSkip: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onRetry();
    } else if (key.escape) {
      onSkip();
    }
  });

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
      {hint && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">{hint}</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>Press Enter to retry, Esc to skip</Text>
      </Box>
    </Box>
  );
}

/**
 * Complete phase component.
 */
function CompletePhase({
  result,
  skipped,
}: {
  result: FirebaseDetectionResult | null;
  skipped: boolean;
}): React.ReactElement {
  if (skipped) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        marginX={1}
        marginY={1}
      >
        <Box>
          <Text color="yellow" bold>
            ! Firebase setup skipped
          </Text>
        </Box>
        <Box>
          <Text dimColor>You can run /firebase later to configure Firebase.</Text>
        </Box>
      </Box>
    );
  }

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
          ✓ Firebase Configuration Complete
        </Text>
      </Box>
      {result && <FirebaseStatusDisplay result={result} showDetails={false} compact={true} />}
    </Box>
  );
}

/**
 * Firebase setup wizard component.
 *
 * Guides users through Firebase configuration detection and validation.
 */
export const FirebaseWizard: React.FC<FirebaseWizardProps> = ({
  projectPath,
  onComplete,
  onCancel,
}) => {
  const [phase, setPhase] = useState<ExtendedWizardPhase>('detecting');
  const [result, setResult] = useState<FirebaseDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validatingPlatform, setValidatingPlatform] = useState<'android' | 'ios' | null>(null);
  const [skipped, setSkipped] = useState(false);

  // Download flow state
  const [downloader] = useState(() => new FirebaseDownloader());
  const [projects, setProjects] = useState<FirebaseProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<FirebaseProject | null>(null);
  const [androidApps, setAndroidApps] = useState<AndroidApp[]>([]);
  const [iosApps, setIosApps] = useState<IosApp[]>([]);
  const [selectedAndroidApp, setSelectedAndroidApp] = useState<AndroidApp | null>(null);
  const [downloadingPlatform, setDownloadingPlatform] = useState<'android' | 'ios' | 'both'>(
    'both',
  );

  // App creation flow state
  const [noAppsContext, setNoAppsContext] = useState<NoAppsContext | null>(null);
  const [creatingAppPlatform, setCreatingAppPlatform] = useState<'android' | 'ios'>('android');

  const [service] = useState(() => new FirebaseService(projectPath));

  // Initial detection
  useEffect(() => {
    const detect = async () => {
      try {
        const detectionResult = await service.detect();
        setResult(detectionResult);
        setPhase('status');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Detection failed');
        setPhase('error');
      }
    };

    if (phase === 'detecting') {
      detect();
    }
  }, [phase, service]);

  const handleContinue = useCallback(() => {
    setPhase('menu');
  }, []);

  const handleSkip = useCallback(() => {
    setSkipped(true);
    setPhase('complete');
    onComplete({
      completed: false,
      skipped: true,
      detection: result,
    });
  }, [onComplete, result]);

  // Helper to determine which platforms need config files
  const getPlatformNeeds = useCallback(() => {
    const platform = result?.platform ?? 'unknown';
    const needsAndroid = platformNeedsAndroidWithUnknown(platform);
    const needsIos = platformNeedsIosWithUnknown(platform);
    const needsAndroidConfig = needsAndroid && !result?.android?.valid;
    const needsIosConfig = needsIos && !result?.ios?.valid;
    return { needsAndroid, needsIos, needsAndroidConfig, needsIosConfig };
  }, [result]);

  // Download config files - defined first as it's called by other handlers via ref
  const handleDownloadConfigs = useCallback(
    async (project: FirebaseProject, androidApp: AndroidApp | null, iosApp: IosApp | null) => {
      if (androidApp && iosApp) {
        setDownloadingPlatform('both');
      } else if (androidApp) {
        setDownloadingPlatform('android');
      } else {
        setDownloadingPlatform('ios');
      }
      setPhase('downloading');

      try {
        const paths = await downloader.getExpectedSavePaths(projectPath);

        if (androidApp && paths.android) {
          await downloader.downloadAndroidConfig(
            project.projectId,
            androidApp.appId,
            paths.android,
          );
        }

        if (iosApp && paths.ios) {
          await downloader.downloadIosConfig(project.projectId, iosApp.appId, paths.ios);
        }

        // Re-detect to verify
        service.clearCache();
        const newResult = await service.detect();
        setResult(newResult);
        setPhase('status');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Download failed');
        setPhase('error');
      }
    },
    [projectPath, downloader, service],
  );

  // Use ref to avoid circular dependencies
  const downloadConfigsRef = useRef(handleDownloadConfigs);
  downloadConfigsRef.current = handleDownloadConfigs;

  // Handle iOS app selection
  const handleIosAppSelect = useCallback(
    (app: IosApp, project: FirebaseProject) => {
      downloadConfigsRef.current(project, selectedAndroidApp, app);
    },
    [selectedAndroidApp],
  );

  // Use ref for iOS app select handler
  const iosAppSelectRef = useRef(handleIosAppSelect);
  iosAppSelectRef.current = handleIosAppSelect;

  // Handle Android app selection
  const handleAndroidAppSelect = useCallback(
    async (app: AndroidApp, project: FirebaseProject, needsIos: boolean) => {
      setSelectedAndroidApp(app);

      if (!needsIos) {
        downloadConfigsRef.current(project, app, null);
        return;
      }

      // Also need iOS config
      try {
        const apps = await downloader.listIosApps(project.projectId);
        setIosApps(apps);

        if (apps.length === 0) {
          // No iOS apps, just download Android
          downloadConfigsRef.current(project, app, null);
        } else if (apps.length === 1) {
          downloadConfigsRef.current(project, app, apps[0]);
        } else {
          setPhase('select_ios_app');
        }
      } catch {
        // Failed to get iOS apps, just download Android
        downloadConfigsRef.current(project, app, null);
      }
    },
    [downloader],
  );

  // Use ref for Android app select handler
  const androidAppSelectRef = useRef(handleAndroidAppSelect);
  androidAppSelectRef.current = handleAndroidAppSelect;

  // Fetch and handle Android apps for a project
  const fetchAndHandleAndroidApps = useCallback(
    async (project: FirebaseProject, needsIosConfig: boolean) => {
      const apps = await downloader.listAndroidApps(project.projectId);
      setAndroidApps(apps);

      if (apps.length === 0) {
        return false; // No Android apps found
      }

      if (apps.length === 1) {
        androidAppSelectRef.current(apps[0], project, needsIosConfig);
      } else {
        setPhase('select_android_app');
      }
      return true;
    },
    [downloader],
  );

  // Fetch and handle iOS apps for a project
  const fetchAndHandleIosApps = useCallback(
    async (project: FirebaseProject) => {
      const apps = await downloader.listIosApps(project.projectId);
      setIosApps(apps);

      if (apps.length === 0) {
        return false; // No iOS apps found
      }

      if (apps.length === 1) {
        iosAppSelectRef.current(apps[0], project);
      } else {
        setPhase('select_ios_app');
      }
      return true;
    },
    [downloader],
  );

  // Handle project selection - fetch apps for required platforms
  const fetchAppsForPlatforms = useCallback(
    async (
      project: FirebaseProject,
      shouldFetchAndroid: boolean,
      shouldFetchIos: boolean,
    ): Promise<{ noAndroidApps: boolean; noIosApps: boolean }> => {
      let noAndroidApps = false;
      let noIosApps = false;

      if (shouldFetchAndroid) {
        const hasAndroidApps = await fetchAndHandleAndroidApps(project, shouldFetchIos);
        if (!hasAndroidApps) {
          noAndroidApps = true;
          if (shouldFetchIos) {
            const hasIosApps = await fetchAndHandleIosApps(project);
            noIosApps = !hasIosApps;
          }
        }
      } else if (shouldFetchIos) {
        const hasIosApps = await fetchAndHandleIosApps(project);
        noIosApps = !hasIosApps;
      }

      return { noAndroidApps, noIosApps };
    },
    [fetchAndHandleAndroidApps, fetchAndHandleIosApps],
  );

  // Handle project selection
  const handleProjectSelect = useCallback(
    async (project: FirebaseProject) => {
      setSelectedProject(project);
      const { needsAndroid, needsIos, needsAndroidConfig, needsIosConfig } = getPlatformNeeds();

      const platform = result?.platform ?? 'unknown';
      const forceDownload = platform === 'unknown';
      const shouldFetchAndroid = needsAndroidConfig || (forceDownload && needsAndroid);
      const shouldFetchIos = needsIosConfig || (forceDownload && needsIos);

      if (!shouldFetchAndroid && !shouldFetchIos) {
        setError('No configuration files needed for this platform.');
        setPhase('error');
        return;
      }

      try {
        const { noAndroidApps, noIosApps } = await fetchAppsForPlatforms(
          project,
          shouldFetchAndroid,
          shouldFetchIos,
        );

        if ((shouldFetchAndroid && noAndroidApps) || (shouldFetchIos && noIosApps)) {
          setNoAppsContext({
            noAndroidApps,
            noIosApps,
            needsAndroid: shouldFetchAndroid,
            needsIos: shouldFetchIos,
          });
          setPhase('no_apps_found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch apps');
        setPhase('error');
      }
    },
    [getPlatformNeeds, fetchAppsForPlatforms, result],
  );

  // Use ref for project select handler
  const projectSelectRef = useRef(handleProjectSelect);
  projectSelectRef.current = handleProjectSelect;

  // Handle download authentication
  const handleDownload = useCallback(async () => {
    setPhase('authenticating');

    try {
      // Check if already authenticated
      const isAuth = await downloader.isAuthenticated();

      if (!isAuth) {
        // Start OAuth flow
        const authResult = await downloader.authenticate(openBrowser);
        if (!authResult.success) {
          setError(authResult.error || 'Authentication failed. Please try again.');
          setPhase('error');
          return;
        }
      }

      // Fetch projects
      const fetchedProjects = await downloader.listProjects();
      if (fetchedProjects.length === 0) {
        setError('No Firebase projects found for this account.');
        setPhase('error');
        return;
      }

      setProjects(fetchedProjects);

      // Auto-select if only one project
      if (fetchedProjects.length === 1) {
        projectSelectRef.current(fetchedProjects[0]);
      } else {
        setPhase('select_project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setPhase('error');
    }
  }, [downloader]);

  const handleAction = useCallback(
    async (action: CredentialAction) => {
      switch (action.type) {
        case 'download':
          await handleDownload();
          break;

        case 'redetect':
          service.clearCache();
          setPhase('detecting');
          break;

        case 'redetect_platform':
          service.clearCache();
          setValidatingPlatform(action.platform);
          setPhase('detecting');
          break;

        case 'validate':
          setValidatingPlatform(action.platform);
          setPhase('validating');
          // Re-detect to validate
          try {
            const newResult = await service.detect(true);
            setResult(newResult);
            setPhase('status');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Validation failed');
            setPhase('error');
          }
          break;

        case 'help': {
          const url = FIREBASE_HELP_URLS[action.topic];
          openBrowser(url);
          break;
        }

        case 'skip':
          handleSkip();
          break;

        case 'done':
          setPhase('complete');
          onComplete({
            completed: true,
            skipped: false,
            detection: result,
          });
          break;
      }
    },
    [service, handleSkip, handleDownload, onComplete, result],
  );

  const handleRetry = useCallback(async () => {
    // Check if this was a scope error - if so, logout and re-authenticate
    if (error && isScopeInsufficientError(error)) {
      // Clear tokens and trigger re-authentication
      await downloader.logout();
      setError(null);
      // Go back to download flow which will re-authenticate
      await handleDownload();
      return;
    }

    setError(null);
    setPhase('detecting');
  }, [error, downloader, handleDownload]);

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      handleSkip();
    }
  }, [onCancel, handleSkip]);

  // Handle creating an app
  const handleCreateApp = useCallback(
    async (platform: 'android' | 'ios', identifier: string, displayName?: string) => {
      if (!selectedProject) {
        setError('No project selected.');
        setPhase('error');
        return;
      }

      setCreatingAppPlatform(platform);
      setPhase('creating_app');

      try {
        if (platform === 'android') {
          const app = await downloader.createAndroidApp(selectedProject.projectId, {
            packageName: identifier,
            displayName,
          });
          setAndroidApps([app]);
          setSelectedAndroidApp(app);

          // Check if we also need iOS
          const { needsIos } = getPlatformNeeds();
          if (needsIos && noAppsContext?.noIosApps) {
            // We need iOS too, go back to no apps found to create iOS
            setNoAppsContext({
              ...noAppsContext,
              noAndroidApps: false,
            });
            setPhase('no_apps_found');
          } else if (needsIos) {
            // Fetch iOS apps
            const iosAppsList = await downloader.listIosApps(selectedProject.projectId);
            if (iosAppsList.length === 0) {
              // Download Android config only, then show no apps for iOS
              downloadConfigsRef.current(selectedProject, app, null);
            } else if (iosAppsList.length === 1) {
              downloadConfigsRef.current(selectedProject, app, iosAppsList[0]);
            } else {
              setIosApps(iosAppsList);
              setPhase('select_ios_app');
            }
          } else {
            // Only needed Android, download config
            downloadConfigsRef.current(selectedProject, app, null);
          }
        } else {
          const app = await downloader.createIosApp(selectedProject.projectId, {
            bundleId: identifier,
            displayName,
          });
          setIosApps([app]);

          // Download config with existing Android app if any
          downloadConfigsRef.current(selectedProject, selectedAndroidApp, app);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create app');
        setPhase('error');
      }
    },
    [selectedProject, downloader, getPlatformNeeds, noAppsContext, selectedAndroidApp],
  );

  // Handlers for no apps found phase
  const handleStartCreateAndroid = useCallback(() => {
    setCreatingAppPlatform('android');
    setPhase('create_android_app');
  }, []);

  const handleStartCreateIos = useCallback(() => {
    setCreatingAppPlatform('ios');
    setPhase('create_ios_app');
  }, []);

  const handleCreateAndroidSubmit = useCallback(
    (identifier: string, displayName?: string) => {
      handleCreateApp('android', identifier, displayName);
    },
    [handleCreateApp],
  );

  const handleCreateIosSubmit = useCallback(
    (identifier: string, displayName?: string) => {
      handleCreateApp('ios', identifier, displayName);
    },
    [handleCreateApp],
  );

  const handleNoAppsCancel = useCallback(() => {
    // Go back to project selection
    setPhase('select_project');
  }, []);

  switch (phase) {
    case 'detecting':
      return <DetectingPhase />;

    case 'status':
      if (!result) {
        return <DetectingPhase />;
      }
      return <StatusPhase result={result} onContinue={handleContinue} onSkip={handleSkip} />;

    case 'menu':
      if (!result) {
        return <DetectingPhase />;
      }
      return <MenuPhase result={result} onAction={handleAction} onCancel={handleCancel} />;

    case 'validating':
      return <ValidatingPhase platform={validatingPlatform || 'android'} />;

    case 'authenticating':
      return <AuthenticatingPhase onCancel={handleCancel} />;

    case 'select_project':
      return (
        <ProjectSelector
          projects={projects}
          onSelect={handleProjectSelect}
          onCancel={handleCancel}
        />
      );

    case 'select_android_app':
      return (
        <AppSelector
          apps={androidApps}
          platform="android"
          onSelect={(app) =>
            selectedProject &&
            handleAndroidAppSelect(
              app as AndroidApp,
              selectedProject,
              (result?.platform === 'ios' ||
                result?.platform === 'react-native' ||
                result?.platform === 'flutter') &&
                !result?.ios?.valid,
            )
          }
          onCancel={handleCancel}
        />
      );

    case 'select_ios_app':
      return (
        <AppSelector
          apps={iosApps}
          platform="ios"
          onSelect={(app) => selectedProject && handleIosAppSelect(app as IosApp, selectedProject)}
          onCancel={handleCancel}
        />
      );

    case 'downloading':
      return <DownloadingPhase platform={downloadingPlatform} />;

    case 'no_apps_found':
      return (
        <NoAppsFoundPhase
          context={
            noAppsContext || {
              noAndroidApps: true,
              noIosApps: true,
              needsAndroid: true,
              needsIos: true,
            }
          }
          onCreateAndroid={handleStartCreateAndroid}
          onCreateIos={handleStartCreateIos}
          onCancel={handleNoAppsCancel}
        />
      );

    case 'create_android_app':
      return (
        <CreateAppInputPhase
          platform="android"
          onSubmit={handleCreateAndroidSubmit}
          onCancel={handleNoAppsCancel}
        />
      );

    case 'create_ios_app':
      return (
        <CreateAppInputPhase
          platform="ios"
          onSubmit={handleCreateIosSubmit}
          onCancel={handleNoAppsCancel}
        />
      );

    case 'creating_app':
      return <CreatingAppPhase platform={creatingAppPlatform} />;

    case 'error':
      return (
        <ErrorPhase error={error || 'Unknown error'} onRetry={handleRetry} onSkip={handleSkip} />
      );

    case 'complete':
      return <CompletePhase result={result} skipped={skipped} />;

    default:
      return <DetectingPhase />;
  }
};
