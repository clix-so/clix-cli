import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openBrowser } from '@/lib/auth/browser';
import type { ProjectType } from '@/lib/config';
import {
  type AndroidApp,
  type CredentialAction,
  FIREBASE_HELP_URLS,
  type FirebaseDetectionResult,
  FirebaseDownloader,
  type FirebaseProject,
  FirebaseService,
  type FirebaseSetupResult,
  type GcpProject,
  type IosApp,
  isOAuthConfigured,
  parseServiceAccountJson,
  platformNeedsAndroid,
  platformNeedsIos,
  type ServiceAccountJson,
  type ServiceAccountValidationResult,
} from '@/lib/services/firebase';
import { detectProjectType } from '@/lib/services/project-detector';
import { OAUTH_CALLBACK_CONFIG } from '@/lib/utils/oauth';
import { useCancelInput } from '@/ui/hooks';
import { FirebaseStatusDisplay } from './FirebaseStatusDisplay';
import { type ExtendedWizardPhase, transition } from './firebase-wizard-transitions';
import { GenericSelector, type SelectorItem } from './GenericSelector';

interface FirebaseWizardProps {
  projectPath: string;
  projectType?: ProjectType;
  clixProjectId?: string;
  onComplete: (result: FirebaseSetupResult) => void;
  onCancel?: () => void;
}

interface MenuAction extends SelectorItem {
  action: CredentialAction;
}

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
 * Get Firebase project ID from detection result.
 * Tries Android config first, then iOS config.
 */
function getProjectIdFromResult(result: FirebaseDetectionResult | null): string | undefined {
  // Android config (GoogleServicesJson) has project_info.project_id
  if (result?.android?.content && 'project_info' in result.android.content) {
    return result.android.content.project_info?.project_id;
  }
  // iOS config (GoogleServiceInfoPlist) has PROJECT_ID
  if (result?.ios?.content && 'PROJECT_ID' in result.ios.content) {
    return result.ios.content.PROJECT_ID;
  }
  return undefined;
}

/**
 * Build Android-specific menu items.
 */
function buildAndroidMenuItems(
  result: FirebaseDetectionResult,
  needsAndroid: boolean,
): MenuAction[] {
  if (!needsAndroid) return [];

  const items: MenuAction[] = [];

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

  return items;
}

/**
 * Build iOS-specific menu items.
 */
function buildIosMenuItems(result: FirebaseDetectionResult, needsIos: boolean): MenuAction[] {
  if (!needsIos) return [];

  const items: MenuAction[] = [];

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

  return items;
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

  // Platform-specific actions (extracted to reduce complexity)
  items.push(...buildAndroidMenuItems(result, needsAndroid));
  items.push(...buildIosMenuItems(result, needsIos));

  // Service Account setup (if OAuth is configured and any platform config is valid)
  const hasValidConfig = result.android?.valid || result.ios?.valid;
  if (isOAuthConfigured() && hasValidConfig) {
    items.push({
      id: 'setup-service-account',
      label: '🔑 Setup Service Account',
      description: 'Create or configure Firebase Admin SDK credentials',
      action: { type: 'setup_service_account' },
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
 * Authenticating phase component.
 */
function AuthenticatingPhase({ onCancel }: { onCancel: () => void }): React.ReactElement {
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
        <Text dimColor>Press Esc/Ctrl+C to cancel</Text>
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

  useCancelInput(onCancel);

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
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
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

  useCancelInput(onCancel);

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
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
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

  useCancelInput(onCancel);

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
            <Text dimColor>Enter to create · Esc/Ctrl+C cancel</Text>
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
 * No projects found phase component - offers to create or link Firebase project.
 */
function NoProjectsPhase({
  onOpenConsole,
  onSelectGcp,
  onCancel,
}: {
  onOpenConsole: () => void;
  onSelectGcp: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = [
    {
      label: '🌐 Open Firebase Console',
      value: 'console',
    },
    {
      label: '📦 Add Firebase to existing GCP project',
      value: 'gcp',
    },
    {
      label: '← Back',
      value: 'cancel',
    },
  ];

  useCancelInput(onCancel);

  const handleSelect = (item: { value: string }) => {
    switch (item.value) {
      case 'console':
        onOpenConsole();
        break;
      case 'gcp':
        onSelectGcp();
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
          No Firebase Projects Found
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>No Firebase projects are associated with this account.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Create a new project or add Firebase to an existing GCP project:</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * GCP project selector component.
 */
function GcpProjectSelector({
  projects,
  onSelect,
  onCancel,
}: {
  projects: GcpProject[];
  onSelect: (project: GcpProject) => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = projects.map((p) => ({
    label: p.name || p.projectId,
    value: p,
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
        <Text bold>Select GCP Project</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Select a project to add Firebase:</Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Adding Firebase to GCP project phase component.
 */
function AddingFirebasePhase({ projectId }: { projectId: string }): React.ReactElement {
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
        <Text bold>Adding Firebase</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Adding Firebase to {projectId}...</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>This may take a moment...</Text>
      </Box>
    </Box>
  );
}

/**
 * Service Account menu action type.
 */
type ServiceAccountMenuAction =
  | { type: 'open_console' }
  | { type: 'paste_json' }
  | { type: 'skip' };

/**
 * Service Account menu phase component.
 */
function ServiceAccountMenuPhase({
  projectId,
  onAction,
  onCancel,
}: {
  projectId: string;
  onAction: (action: ServiceAccountMenuAction) => void;
  onCancel: () => void;
}): React.ReactElement {
  const items: Array<{ label: string; value: ServiceAccountMenuAction }> = [
    {
      label: '🌐 Download from Firebase Console',
      value: { type: 'open_console' },
    },
    {
      label: '📄 Paste Service Account JSON',
      value: { type: 'paste_json' },
    },
    {
      label: '⏭ Skip (configure later)',
      value: { type: 'skip' },
    },
  ];

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
        <Text bold>Service Account Setup</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>Project: {projectId}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Service Account is required for server-side Firebase Admin SDK.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Download the private key JSON from Firebase Console (Project Settings → Service Accounts →
          Generate new private key), then paste it here.
        </Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onAction(item.value)} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Import Service Account JSON phase component.
 * Accepts a file path to a downloaded JSON file.
 */
/**
 * Read text content from system clipboard.
 * Uses pbpaste on macOS, xclip or xsel on Linux.
 */
async function readClipboard(): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('pbpaste', []);
      return stdout;
    }
    if (platform === 'linux') {
      try {
        const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-o']);
        return stdout;
      } catch {
        const { stdout } = await execFileAsync('xsel', ['--clipboard', '--output']);
        return stdout;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read file content from a file path.
 * Supports ~ home directory and relative paths.
 */
async function readFileFromPath(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  // Strip surrounding quotes (from drag & drop on some terminals)
  const cleaned = filePath.replace(/^['"]|['"]$/g, '');
  const resolved = cleaned.startsWith('~')
    ? path.join(process.env.HOME || '', cleaned.slice(1))
    : path.resolve(cleaned);

  return fs.readFile(resolved, 'utf-8');
}

function PasteServiceAccountPhase({
  onSubmit,
  onCancel,
}: {
  onSubmit: (json: ServiceAccountJson) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [input, setInput] = useState('');
  const [validation, setValidation] = useState<ServiceAccountValidationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  useCancelInput(onCancel);

  const processJson = useCallback(
    (content: string, source: string) => {
      const result = parseServiceAccountJson(content);
      if (result.valid && result.data) {
        setValidation(result);
        onSubmit(result.data);
      } else {
        setValidation(result);
        setErrorMsg(`Invalid Service Account JSON (from ${source})`);
      }
    },
    [onSubmit],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();

    setLoading(true);
    setErrorMsg(null);
    setValidation(null);

    try {
      if (!trimmed) {
        // Empty input → read from clipboard
        setLoadingText('Reading from clipboard...');
        const clipboard = await readClipboard();
        if (!clipboard?.trim()) {
          setErrorMsg('Clipboard is empty. Copy the JSON content first.');
          return;
        }
        processJson(clipboard, 'clipboard');
      } else if (trimmed.startsWith('{')) {
        // JSON-like input → parse directly
        processJson(trimmed, 'input');
      } else {
        // File path → read file
        setLoadingText('Reading file...');
        const content = await readFileFromPath(trimmed);
        processJson(content, 'file');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        setErrorMsg('File not found. Please check the path.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to read input');
      }
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  }, [input, processJson]);

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
        <Text bold>Import Service Account JSON</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Firebase Console → Project Settings → Service accounts → Generate new private key
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>1. Copy JSON to clipboard → press Enter</Text>
        <Text dimColor>2. Drag the JSON file here → press Enter</Text>
      </Box>

      <Box>
        <Text color="blue">{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          placeholder="Press Enter to read clipboard, or drag file here"
          onSubmit={handleSubmit}
        />
      </Box>

      {loading && (
        <Box marginTop={1}>
          <Text dimColor>
            <Spinner type="dots" />
          </Text>
          <Text> {loadingText}</Text>
        </Box>
      )}

      {errorMsg && (
        <Box marginTop={1}>
          <Text color="red">✗ {errorMsg}</Text>
        </Box>
      )}

      {validation && !validation.valid && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">Validation errors:</Text>
          {validation.errors.map((err) => (
            <Box key={err}>
              <Text color="red"> • {err}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to import · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Saving Service Account phase component.
 */
function SavingServiceAccountPhase(): React.ReactElement {
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
        <Text bold>Saving Service Account</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Saving service account key...</Text>
      </Box>
    </Box>
  );
}

/**
 * Checking sender config phase component.
 */
function CheckingSenderConfigPhase(): React.ReactElement {
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
        <Text> Checking push notification configuration...</Text>
      </Box>
    </Box>
  );
}

/**
 * Sender config already registered phase component.
 */
function SenderConfigRegisteredPhase({
  updatedAt,
  onContinue,
  onCancel,
}: {
  updatedAt: string | null;
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  useCancelInput(onCancel);

  const formattedDate = updatedAt ? new Date(updatedAt).toLocaleString() : 'unknown';

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
        <Text bold>Push Notification Configuration</Text>
      </Box>
      <Box>
        <Text color="green">✓ FCM sender config is already registered</Text>
      </Box>
      <Box>
        <Text dimColor>Configured at: {formattedDate}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to continue, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Registering sender config phase component.
 */
function RegisteringSenderConfigPhase({
  result,
}: {
  result: 'success' | 'failed' | null;
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={result === 'failed' ? 'yellow' : 'blue'}
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Push Notification Configuration</Text>
      </Box>
      {result === 'success' ? (
        <Box>
          <Text color="green">✓ Push notification configured successfully</Text>
        </Box>
      ) : result === 'failed' ? (
        <Box>
          <Text color="yellow">
            ✗ Failed to register sender config (can be configured later in Console)
          </Text>
        </Box>
      ) : (
        <Box>
          <Text dimColor>
            <Spinner type="dots" />
          </Text>
          <Text> Registering push notification configuration...</Text>
        </Box>
      )}
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
    }
  });

  useCancelInput(onSkip);

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
        <Text dimColor>Press Enter to configure, Esc/Ctrl+C to skip</Text>
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
  if (error.includes('invalid_request')) {
    return `The OAuth request was malformed or missing required parameters.
This can happen when:
- OAuth client redirect URI is misconfigured
- Required PKCE parameters are missing or invalid
- Browser session expired before completing auth

Check .clix/debug.log for detailed error information.`;
  }
  if (error.includes('API has not been used in project') || error.includes('it is disabled')) {
    return `A required Google Cloud API is not enabled for this project.
Visit the URL shown above to enable it in Google Cloud Console.
After enabling, wait a few minutes then press Enter to retry.`;
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
    }
  });

  useCancelInput(onSkip);

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
      {!hint && (
        <Box marginBottom={1}>
          <Text dimColor>See .clix/debug.log for details</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>Press Enter to retry, Esc/Ctrl+C to skip</Text>
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
  projectType: propProjectType,
  clixProjectId,
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

  // GCP project flow state (for adding Firebase to existing GCP project)
  const [gcpProjects, setGcpProjects] = useState<GcpProject[]>([]);
  const [selectedGcpProject, setSelectedGcpProject] = useState<GcpProject | null>(null);

  // Service Account flow state
  const [, setServiceAccountJson] = useState<ServiceAccountJson | null>(null);

  // Sender config state
  const [senderConfigUpdatedAt, setSenderConfigUpdatedAt] = useState<string | null>(null);
  const [senderConfigResult, setSenderConfigResult] = useState<'success' | 'failed' | null>(null);

  const [service, setService] = useState<FirebaseService | null>(null);
  const [projectType, setProjectType] = useState<ProjectType | null>(propProjectType ?? null);

  // Initial detection
  useEffect(() => {
    const detect = async () => {
      try {
        const detectedProjectType = propProjectType ?? (await detectProjectType(projectPath));
        setProjectType(detectedProjectType);
        const firebaseService = new FirebaseService(projectPath, detectedProjectType);
        setService(firebaseService);
        const detectionResult = await firebaseService.detect();
        setResult(detectionResult);
        setPhase(transition('detecting', 'success'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Detection failed');
        setPhase(transition('detecting', 'error'));
      }
    };

    if (phase === 'detecting') {
      detect();
    }
  }, [phase, projectPath, propProjectType]);

  // Sender config check effect
  useEffect(() => {
    if (phase !== 'checking_sender_config') return;

    const checkSenderConfig = async () => {
      // Skip API check if no Clix project linked, but still go to SA setup
      if (!clixProjectId) {
        setPhase(transition('checking_sender_config', 'skip'));
        return;
      }

      try {
        const { getInternalApiClient } = await import('@/lib/api');
        const apiClient = getInternalApiClient();
        const project = await apiClient.getProject(clixProjectId);
        const pushConfig = project.sender_configs?.find(
          (c) => c.channel_type === 'CHANNEL_TYPE_APP_PUSH',
        );

        if (pushConfig) {
          setSenderConfigUpdatedAt(pushConfig.updated_at ?? pushConfig.created_at ?? null);
          setPhase(transition('checking_sender_config', 'registered'));
        } else {
          setPhase(transition('checking_sender_config', 'not_registered'));
        }
      } catch {
        // API error should not block setup, still go to SA menu
        setPhase(transition('checking_sender_config', 'error'));
      }
    };

    checkSenderConfig();
  }, [phase, clixProjectId]);

  const handleContinue = useCallback(() => {
    setPhase(transition('status', 'continue'));
  }, []);

  const handleSkip = useCallback(() => {
    setSkipped(true);
    setPhase(transition('menu', 'skip'));
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
      if (!projectType) {
        setError('Project type not detected');
        setPhase(transition('select_project', 'error'));
        return;
      }

      if (androidApp && iosApp) {
        setDownloadingPlatform('both');
      } else if (androidApp) {
        setDownloadingPlatform('android');
      } else {
        setDownloadingPlatform('ios');
      }
      setPhase('downloading'); // Direct set: entry point from multiple phases

      try {
        const paths = downloader.getExpectedSavePaths(projectPath, projectType);

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
        if (service) {
          const newResult = await service.detect();
          setResult(newResult);
        }
        setPhase(transition('downloading', 'success'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Download failed');
        setPhase(transition('downloading', 'error'));
      }
    },
    [projectPath, projectType, downloader, service],
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
          setPhase(transition('select_android_app', 'select_ios_app'));
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
        setPhase(transition('select_project', 'select_android_app'));
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
        setPhase(transition('select_project', 'select_ios_app'));
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
        setPhase(transition('select_project', 'error'));
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
          setPhase(transition('select_project', 'no_apps_found'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch apps');
        setPhase(transition('select_project', 'error'));
      }
    },
    [getPlatformNeeds, fetchAppsForPlatforms, result],
  );

  // Use ref for project select handler
  const projectSelectRef = useRef(handleProjectSelect);
  projectSelectRef.current = handleProjectSelect;

  // Handle download authentication
  const handleDownload = useCallback(async () => {
    setPhase('authenticating'); // Direct set: entry point from menu/download action

    try {
      // Check if already authenticated
      const isAuth = await downloader.isAuthenticated();

      if (!isAuth) {
        // Start OAuth flow
        const authResult = await downloader.authenticate(openBrowser);
        if (!authResult.success) {
          setError(authResult.error || 'Authentication failed. Please try again.');
          setPhase(transition('authenticating', 'error'));
          return;
        }
      }

      // Fetch projects
      const fetchedProjects = await downloader.listProjects();
      if (fetchedProjects.length === 0) {
        // No Firebase projects - show options to create or add Firebase to GCP project
        setPhase(transition('authenticating', 'no_projects'));
        return;
      }

      setProjects(fetchedProjects);

      // Auto-select if only one project
      if (fetchedProjects.length === 1) {
        projectSelectRef.current(fetchedProjects[0]);
      } else {
        setPhase(transition('authenticating', 'select_project'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setPhase(transition('authenticating', 'error'));
    }
  }, [downloader]);

  // Handler for Service Account setup (defined before handleAction to be used in it)
  const handleServiceAccountSetup = useCallback(() => {
    // Get project ID from detection result
    const projectId = getProjectIdFromResult(result);
    if (!projectId) {
      setError('No Firebase project configured. Please download config files first.');
      setPhase('error');
      return;
    }

    setPhase(transition('menu', 'setup_service_account'));
  }, [result]);

  const handleAction = useCallback(
    async (action: CredentialAction) => {
      switch (action.type) {
        case 'download':
          await handleDownload();
          break;

        case 'redetect':
          setPhase(transition('menu', 'redetect'));
          break;

        case 'redetect_platform':
          setValidatingPlatform(action.platform);
          setPhase(transition('menu', 'redetect_platform'));
          break;

        case 'validate':
          setValidatingPlatform(action.platform);
          setPhase(transition('menu', 'validate'));
          // Re-detect to validate
          try {
            if (service) {
              const newResult = await service.detect();
              setResult(newResult);
            }
            setPhase(transition('validating', 'success'));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Validation failed');
            setPhase(transition('validating', 'error'));
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
          setPhase(transition('menu', 'done'));
          onComplete({
            completed: true,
            skipped: false,
            detection: result,
          });
          break;

        case 'setup_service_account':
          // Start service account setup flow
          await handleServiceAccountSetup();
          break;
      }
    },
    [service, handleSkip, handleDownload, onComplete, result, handleServiceAccountSetup],
  );

  const handleRetry = useCallback(async () => {
    // Check if this was a scope error or invalid_grant - if so, logout and re-authenticate
    if (error && (isScopeInsufficientError(error) || error.includes('invalid_grant'))) {
      // Clear tokens and trigger re-authentication
      await downloader.logout();
      setError(null);
      // Go back to download flow which will re-authenticate
      await handleDownload();
      return;
    }

    setError(null);
    setPhase(transition('error', 'retry'));
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
      setPhase('creating_app'); // Direct set: entry point from create_android_app/create_ios_app

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
            setPhase(transition('creating_app', 'no_apps_found'));
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
              setPhase(transition('creating_app', 'select_ios_app'));
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
        setPhase(transition('creating_app', 'error'));
      }
    },
    [selectedProject, downloader, getPlatformNeeds, noAppsContext, selectedAndroidApp],
  );

  // Handlers for no apps found phase
  const handleStartCreateAndroid = useCallback(() => {
    setCreatingAppPlatform('android');
    setPhase(transition('no_apps_found', 'create_android'));
  }, []);

  const handleStartCreateIos = useCallback(() => {
    setCreatingAppPlatform('ios');
    setPhase(transition('no_apps_found', 'create_ios'));
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
    setPhase(transition('no_apps_found', 'cancel'));
  }, []);

  // Handler for opening Firebase Console
  const handleOpenFirebaseConsole = useCallback(() => {
    openBrowser('https://console.firebase.google.com/');
    // Go back to menu after opening
    setPhase(transition('no_projects', 'open_console'));
  }, []);

  // Handler for fetching GCP projects (to add Firebase)
  const handleFetchGcpProjects = useCallback(async () => {
    setPhase('authenticating'); // Direct set: entry point from no_projects
    try {
      const availableGcpProjects = await downloader.listAvailableGcpProjects();
      if (availableGcpProjects.length === 0) {
        setError('No GCP projects available to add Firebase. Create a project first.');
        setPhase(transition('authenticating', 'error'));
        return;
      }
      setGcpProjects(availableGcpProjects);
      setPhase(transition('authenticating', 'select_gcp_project'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch GCP projects');
      setPhase(transition('authenticating', 'error'));
    }
  }, [downloader]);

  // Handler for GCP project selection
  const handleGcpProjectSelect = useCallback(
    async (project: GcpProject) => {
      setSelectedGcpProject(project);
      setPhase(transition('select_gcp_project', 'adding_firebase'));

      try {
        const firebaseProject = await downloader.addFirebaseToProject(project.projectId);
        // Add to projects list and select it
        setProjects([firebaseProject]);
        projectSelectRef.current(firebaseProject);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add Firebase to project');
        setPhase(transition('adding_firebase', 'error'));
      }
    },
    [downloader],
  );

  // Handler for Service Account menu action
  const handleServiceAccountMenuAction = useCallback(
    (action: ServiceAccountMenuAction) => {
      const projectId = getProjectIdFromResult(result);
      if (!projectId) {
        setError('No project ID found');
        setPhase(transition('service_account_menu', 'error'));
        return;
      }

      switch (action.type) {
        case 'open_console':
          openBrowser(
            `https://console.firebase.google.com/project/${projectId}/settings/serviceaccounts/adminsdk`,
          );
          // Stay on menu so user can paste after downloading
          setPhase(transition('service_account_menu', 'open_console'));
          break;

        case 'paste_json':
          setPhase(transition('service_account_menu', 'paste_json'));
          break;

        case 'skip':
          setPhase(transition('service_account_menu', 'skip'));
          break;
      }
    },
    [result],
  );

  // Handler for pasting service account JSON
  // Only saves the file, then transitions to registering_sender_config or complete
  const handleSaveServiceAccountJson = useCallback(
    async (json: ServiceAccountJson) => {
      setPhase(transition('paste_service_account', 'save'));

      try {
        setServiceAccountJson(json);
        await downloader.saveServiceAccountJson(projectPath, json);

        // Decide next phase: register sender config if Clix project is linked
        if (clixProjectId) {
          setPhase(transition('saving_service_account', 'register'));
        } else {
          setPhase(transition('saving_service_account', 'complete'));
          onComplete({ completed: true, skipped: false, detection: result });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save service account');
        setPhase(transition('saving_service_account', 'error'));
      }
    },
    [downloader, projectPath, clixProjectId, onComplete, result],
  );

  // Sender config registration effect - triggered when entering registering_sender_config phase
  useEffect(() => {
    if (phase !== 'registering_sender_config' || !clixProjectId) return;

    const registerSenderConfig = async () => {
      try {
        const { getInternalApiClient } = await import('@/lib/api');
        const apiClient = getInternalApiClient();
        const saJsonPath = `${projectPath}/.clix/firebase-service-account.json`;
        const { readFile } = await import('node:fs/promises');
        const saContent = await readFile(saJsonPath, 'utf-8');
        const encoded = btoa(saContent);
        await apiClient.createOrUpdateSenderConfig(clixProjectId, {
          channel_type: 'CHANNEL_TYPE_APP_PUSH',
          app_push: {
            ios_config: { fcm_sa_json_base64_encoded: encoded },
            android_config: { fcm_sa_json_base64_encoded: encoded },
          },
        });
        setSenderConfigResult('success');
      } catch {
        setSenderConfigResult('failed');
      }

      // Auto-complete after brief display
      setTimeout(() => {
        setPhase(transition('registering_sender_config', 'complete'));
        onComplete({ completed: true, skipped: false, detection: result });
      }, 1500);
    };

    registerSenderConfig();
  }, [phase, clixProjectId, projectPath, onComplete, result]);

  // Handler for going back to service account menu
  const handleServiceAccountCancel = useCallback(() => {
    setPhase(transition('paste_service_account', 'cancel'));
  }, []);

  // Handler for sender config registered → complete wizard
  const handleSenderConfigContinue = useCallback(() => {
    setPhase(transition('sender_config_registered', 'continue'));
    onComplete({ completed: true, skipped: false, detection: result });
  }, [onComplete, result]);

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

    // New phases for no projects and service account
    case 'no_projects':
      return (
        <NoProjectsPhase
          onOpenConsole={handleOpenFirebaseConsole}
          onSelectGcp={handleFetchGcpProjects}
          onCancel={handleCancel}
        />
      );

    case 'select_gcp_project':
      return (
        <GcpProjectSelector
          projects={gcpProjects}
          onSelect={handleGcpProjectSelect}
          onCancel={handleCancel}
        />
      );

    case 'adding_firebase':
      return <AddingFirebasePhase projectId={selectedGcpProject?.projectId || ''} />;

    case 'service_account_menu':
      return (
        <ServiceAccountMenuPhase
          projectId={getProjectIdFromResult(result) || ''}
          onAction={handleServiceAccountMenuAction}
          onCancel={handleCancel}
        />
      );

    case 'paste_service_account':
      return (
        <PasteServiceAccountPhase
          onSubmit={handleSaveServiceAccountJson}
          onCancel={handleServiceAccountCancel}
        />
      );

    case 'saving_service_account':
      return <SavingServiceAccountPhase />;

    case 'checking_sender_config':
      return <CheckingSenderConfigPhase />;

    case 'sender_config_registered':
      return (
        <SenderConfigRegisteredPhase
          updatedAt={senderConfigUpdatedAt}
          onContinue={handleSenderConfigContinue}
          onCancel={handleCancel}
        />
      );

    case 'registering_sender_config':
      return <RegisteringSenderConfigPhase result={senderConfigResult} />;

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
