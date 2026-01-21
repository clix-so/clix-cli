import { spawn } from 'node:child_process';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
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
  type WizardPhase,
} from '@/lib/services/firebase';
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
  | 'downloading';

/**
 * Build menu items based on detection result.
 */
function buildMenuItems(result: FirebaseDetectionResult): MenuAction[] {
  const items: MenuAction[] = [];

  const needsAndroid =
    result.platform === 'android' ||
    result.platform === 'react-native' ||
    result.platform === 'flutter';
  const needsIos =
    result.platform === 'ios' ||
    result.platform === 'react-native' ||
    result.platform === 'flutter';

  const hasMissingConfigs =
    (needsAndroid && !result.android?.valid) || (needsIos && !result.ios?.valid);

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
function AuthenticatingPhase(): React.ReactElement {
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
    const needsAndroid =
      result?.platform === 'android' ||
      result?.platform === 'react-native' ||
      result?.platform === 'flutter';
    const needsIos =
      result?.platform === 'ios' ||
      result?.platform === 'react-native' ||
      result?.platform === 'flutter';
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

  // Handle project selection
  const handleProjectSelect = useCallback(
    async (project: FirebaseProject) => {
      setSelectedProject(project);
      const { needsAndroidConfig, needsIosConfig } = getPlatformNeeds();

      try {
        if (needsAndroidConfig) {
          const hasAndroidApps = await fetchAndHandleAndroidApps(project, needsIosConfig);
          if (!hasAndroidApps) {
            // No Android apps, try iOS if needed
            if (needsIosConfig) {
              const hasIosApps = await fetchAndHandleIosApps(project);
              if (!hasIosApps) {
                setError('No apps found in this Firebase project.');
                setPhase('error');
              }
            } else {
              setError('No Android apps found in this Firebase project.');
              setPhase('error');
            }
          }
        } else if (needsIosConfig) {
          const hasIosApps = await fetchAndHandleIosApps(project);
          if (!hasIosApps) {
            setError('No iOS apps found in this Firebase project.');
            setPhase('error');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch apps');
        setPhase('error');
      }
    },
    [getPlatformNeeds, fetchAndHandleAndroidApps, fetchAndHandleIosApps],
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
        const success = await downloader.authenticate(openBrowser);
        if (!success) {
          setError('Authentication failed. Please try again.');
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

  const handleRetry = useCallback(() => {
    setError(null);
    setPhase('detecting');
  }, []);

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      handleSkip();
    }
  }, [onCancel, handleSkip]);

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
      return <AuthenticatingPhase />;

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
