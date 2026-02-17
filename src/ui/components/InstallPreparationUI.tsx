/**
 * Install preparation UI component.
 *
 * Uses a single task orchestrator to enforce required setup order
 * before SDK installation.
 *
 * @module ui/components/InstallPreparationUI
 */

import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { ApnsStatus, IosStatus, PreparationContext } from '@/commands/skill/preparation';
import { gatherPreparationContext, saveSetupStatus } from '@/commands/skill/preparation';
import { openBrowser } from '@/lib/auth/browser';
import type { ProjectType } from '@/lib/config';
import {
  analyzeIosProject,
  createExtensionFiles,
  type ExtensionContext,
  type ExtensionGeneratorResult,
  generateAppGroupId,
  getEntitlementsPath,
  getExtensionBundleId,
  getExtensionName,
  getIosProjectDir,
  verifyExtensionFiles,
} from '@/lib/ios';
import type { PushSetupContext } from '@/lib/push';
import {
  type AndroidApp,
  FIREBASE_HELP_URLS,
  type FirebaseDetectionResult,
  FirebaseDownloader,
  type FirebaseProject,
  FirebaseService,
  type GcpProject,
  type IosApp,
  isOAuthConfigured,
  type ServiceAccountJson,
} from '@/lib/services/firebase';
import { detectProjectType, formatProjectType } from '@/lib/services/project-detector';
import { isCtrlCInput, useCancelInput } from '@/ui/hooks';
import {
  FirebaseConfigAddingFirebaseTask,
  FirebaseConfigAppSelectorTask,
  FirebaseConfigAuthenticatingTask,
  FirebaseConfigCreateAppInputTask,
  FirebaseConfigCreatingAppTask,
  FirebaseConfigDetectingTask,
  FirebaseConfigDownloadingTask,
  FirebaseConfigErrorTask,
  FirebaseConfigGcpProjectSelectorTask,
  type NoAppsContext as FirebaseConfigNoAppsContext,
  FirebaseConfigNoAppsFoundTask,
  FirebaseConfigNoProjectsTask,
  FirebaseConfigProjectSelectorTask,
  FirebaseConfigStatusTask,
  platformNeedsAndroidWithUnknown as firebaseConfigNeedsAndroid,
  platformNeedsIosWithUnknown as firebaseConfigNeedsIos,
  hasValidFirebaseConfigFiles as hasValidFirebaseConfigTaskFiles,
} from './FirebaseConfigFilesSetup';
import {
  FirebaseServiceAccountCheckingSenderConfigTask,
  FirebaseServiceAccountDetectingTask,
  FirebaseServiceAccountErrorTask,
  FirebaseServiceAccountPasteTask,
  FirebaseServiceAccountRegisteredTask,
  FirebaseServiceAccountRegisteringTask,
  FirebaseServiceAccountRegistrationFailedTask,
  FirebaseServiceAccountSavingTask,
  getProjectIdFromResult as getFirebaseProjectIdFromConfig,
  hasValidFirebaseConfigFiles as hasValidServiceAccountConfigFiles,
} from './FirebaseServiceAccountSetup';
import { GenericSelector, type SelectorItem } from './GenericSelector';
import {
  getApplicableInstallTasks,
  getNextIncompleteTaskId,
  INSTALL_TASK_LABELS,
  type InstallTaskId,
  isTaskCompleted,
} from './install-preparation-tasks';
import {
  IosEntitlementsTask,
  type IosEntitlementsTaskResult,
} from './ios-setup/IosEntitlementsTask';
import {
  NotificationExtensionBuildSettingsTask,
  NotificationExtensionCompleteTask,
  NotificationExtensionDependenciesTask,
  type NotificationExtensionSetupContext,
  NotificationExtensionVerificationTask,
  NotificationExtensionXcodeTask,
} from './notification-extension-setup/NotificationExtensionTasks';
import {
  type ApnsKeyAcquisitionResult,
  ApnsKeyAcquisitionTask,
  type DetectionResult,
  FirebaseApnsRegistrationTask,
  FirebaseProjectSelectionTask,
  PushDetectionTask,
} from './push-setup/PushSetupTasks';

type PreparationPhase = 'checking' | 'config_missing' | 'status' | 'task' | 'cancelled';

type InstallLeafTaskId =
  | 'firebase_config_detecting'
  | 'firebase_config_status'
  | 'firebase_config_authenticating'
  | 'firebase_config_select_project'
  | 'firebase_config_select_android_app'
  | 'firebase_config_select_ios_app'
  | 'firebase_config_downloading'
  | 'firebase_config_no_apps_found'
  | 'firebase_config_create_android_app'
  | 'firebase_config_create_ios_app'
  | 'firebase_config_creating_app'
  | 'firebase_config_no_projects'
  | 'firebase_config_select_gcp_project'
  | 'firebase_config_adding_firebase'
  | 'firebase_config_error'
  | 'apns_detecting'
  | 'apns_input'
  | 'apns_select_firebase_project'
  | 'apns_registering'
  | 'firebase_service_account_detecting'
  | 'firebase_service_account_checking_sender_config'
  | 'firebase_service_account_registered'
  | 'firebase_service_account_input'
  | 'firebase_service_account_saving'
  | 'firebase_service_account_registering'
  | 'firebase_service_account_registration_failed'
  | 'firebase_service_account_error'
  | 'ios_entitlements_run'
  | 'nse_prepare_context'
  | 'nse_create_files'
  | 'nse_xcode_target'
  | 'nse_build_settings'
  | 'nse_dependencies'
  | 'nse_verification'
  | 'nse_complete';

type MissingDisplayMode = 'full' | 'summary' | 'hidden';

interface StatusLayoutPolicy {
  showOuterSpacing: boolean;
  showStatusSpacing: boolean;
  showProjectType: boolean;
  showDetailText: boolean;
  missingDisplayMode: MissingDisplayMode;
}

const FALLBACK_TERMINAL_ROWS = 24;
const COMPACT_ROWS_THRESHOLD = 33;
const MINIMAL_ROWS_THRESHOLD = 28;

interface InstallPreparationUIProps {
  projectPath?: string;
  onComplete: (context: PreparationContext) => void;
  onCancel: () => void;
}

interface ActionItem extends SelectorItem {
  action: 'continue' | 'cancel';
}

type StatusLineState = 'pending' | 'checking' | 'ok' | 'missing' | 'skipped';

interface StatusRow {
  label: string;
  status: StatusLineState;
  detail?: string;
}

interface IosGuidedContextCache {
  bundleId: string;
  appGroupId: string;
  appName: string;
  iosDir: string;
  entitlementsPath: string;
}

interface TaskCompletionPatch {
  ios?: Partial<IosStatus>;
  apns?: Partial<ApnsStatus>;
}

interface FirebaseConfigState {
  detection: FirebaseDetectionResult | null;
  projectType: ProjectType | null;
  service: FirebaseService | null;
  projects: FirebaseProject[];
  selectedProject: FirebaseProject | null;
  androidApps: AndroidApp[];
  iosApps: IosApp[];
  selectedAndroidApp: AndroidApp | null;
  downloadingPlatform: 'android' | 'ios' | 'both';
  noAppsContext: FirebaseConfigNoAppsContext | null;
  creatingAppPlatform: 'android' | 'ios';
  gcpProjects: GcpProject[];
  selectedGcpProject: GcpProject | null;
  error: string | null;
}

interface FirebaseServiceAccountState {
  detection: FirebaseDetectionResult | null;
  projectId: string | null;
  senderConfigUpdatedAt: string | null;
  serviceAccountJson: ServiceAccountJson | null;
  registrationError: string | null;
  error: string | null;
  errorNextLeafTaskId: InstallLeafTaskId;
}

interface ApnsState {
  detection: DetectionResult;
  acquisition: ApnsKeyAcquisitionResult | null;
  selectedProject: FirebaseProject | null;
}

interface NotificationExtensionState {
  context: NotificationExtensionSetupContext | null;
  extensionResult: ExtensionGeneratorResult | null;
  error: string | null;
}

async function buildNotificationExtensionContext(
  projectPath: string,
  iosBundleId: string | undefined,
  iosAppGroupId: string | undefined,
  cachedContext: IosGuidedContextCache | null,
): Promise<NotificationExtensionSetupContext> {
  if (cachedContext) {
    return cachedContext;
  }

  const analysis = await analyzeIosProject(projectPath);
  if (!analysis.success || !analysis.project) {
    throw new Error(analysis.error || 'Failed to analyze iOS project');
  }

  const bundleId = iosBundleId || analysis.project.bundleId;
  const iosDir = getIosProjectDir(projectPath);
  if (!iosDir) {
    throw new Error('iOS directory not found');
  }

  const targetName = analysis.project.targets[0] || analysis.project.appName;
  const entitlementsPath =
    analysis.project.entitlementsFiles[0] || getEntitlementsPath(iosDir, targetName);
  const appGroupId = iosAppGroupId || generateAppGroupId(bundleId);

  return {
    bundleId,
    appGroupId,
    appName: analysis.project.appName,
    iosDir,
    entitlementsPath,
  };
}

function normalizeTerminalRows(rows = process.stdout.rows): number {
  if (typeof rows !== 'number' || !Number.isFinite(rows) || rows <= 0) {
    return FALLBACK_TERMINAL_ROWS;
  }
  return rows;
}

export function getStatusLayoutPolicy(rows = process.stdout.rows): StatusLayoutPolicy {
  const terminalRows = normalizeTerminalRows(rows);

  if (terminalRows <= MINIMAL_ROWS_THRESHOLD) {
    return {
      showOuterSpacing: false,
      showStatusSpacing: false,
      showProjectType: false,
      showDetailText: false,
      missingDisplayMode: 'hidden',
    };
  }

  if (terminalRows <= COMPACT_ROWS_THRESHOLD) {
    return {
      showOuterSpacing: false,
      showStatusSpacing: false,
      showProjectType: true,
      showDetailText: true,
      missingDisplayMode: 'summary',
    };
  }

  return {
    showOuterSpacing: true,
    showStatusSpacing: true,
    showProjectType: true,
    showDetailText: true,
    missingDisplayMode: 'full',
  };
}

function getTaskDetail(
  context: PreparationContext,
  taskId: InstallTaskId,
  showDetailText: boolean,
): string | undefined {
  if (!showDetailText) {
    return undefined;
  }

  switch (taskId) {
    case 'firebase_config_files':
      return context.firebase.androidConfigured && context.firebase.iosConfigured
        ? context.firebase.projectId || 'configured'
        : 'not configured';
    case 'apns_key_for_firebase':
      return context.apns.registeredWithFirebase ? context.apns.keyId || 'configured' : 'not set';
    case 'firebase_service_account':
      return context.firebase.senderConfigConfigured ? 'registered' : 'not set';
    case 'ios_entitlements':
      return context.ios.entitlementsConfigured ? 'configured' : 'not configured';
    case 'notification_service_extension':
      return context.ios.nseConfigured ? 'configured' : 'not configured';
    default:
      return undefined;
  }
}

function getStatusRows(context: PreparationContext, layoutPolicy: StatusLayoutPolicy): StatusRow[] {
  const rows: StatusRow[] = [
    {
      label: 'Project linked',
      status: 'ok',
      detail: layoutPolicy.showDetailText ? context.config.project.name : undefined,
    },
  ];

  if (layoutPolicy.showProjectType) {
    rows.push({
      label: 'Project type',
      status: context.projectType.framework !== 'unknown' ? 'ok' : 'missing',
      detail: layoutPolicy.showDetailText ? formatProjectType(context.projectType) : undefined,
    });
  }

  const taskRows: StatusRow[] = getApplicableInstallTasks(context).map((taskId) => ({
    label: INSTALL_TASK_LABELS[taskId],
    status: isTaskCompleted(context, taskId) ? 'ok' : 'missing',
    detail: getTaskDetail(context, taskId, layoutPolicy.showDetailText),
  }));

  return [...rows, ...taskRows];
}

function StatusLine({
  label,
  status,
  detail,
}: {
  label: string;
  status: StatusLineState;
  detail?: string;
}): React.ReactElement {
  const icon =
    status === 'ok'
      ? '✓'
      : status === 'missing'
        ? '✗'
        : status === 'skipped'
          ? '○'
          : status === 'checking'
            ? '○'
            : '○';
  const color =
    status === 'ok'
      ? 'green'
      : status === 'missing'
        ? 'red'
        : status === 'skipped'
          ? 'yellow'
          : 'gray';

  return (
    <Box>
      <Text color={color}>{icon}</Text>
      <Text> {label}</Text>
      {detail && <Text color="gray"> ({detail})</Text>}
      {status === 'checking' && (
        <Text color="cyan">
          {' '}
          <Spinner type="dots" />
        </Text>
      )}
    </Box>
  );
}

function CheckingPhase(): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Checking project configuration...</Text>
      </Box>
    </Box>
  );
}

function ConfigMissingPhase({ onCancel }: { onCancel: () => void }): React.ReactElement {
  useCancelInput(onCancel);

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="red">✗ Project not linked</Text>
      <Text color="gray">Run "clix login" first to link this project.</Text>
      <Box marginTop={1}>
        <Text dimColor>Press Esc to exit</Text>
      </Box>
    </Box>
  );
}

function StatusPhase({
  context,
  note,
  onContinue,
  onCancel,
}: {
  context: PreparationContext;
  note: string | null;
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const layoutPolicy = getStatusLayoutPolicy();
  const statusRows = getStatusRows(context, layoutPolicy);
  const showMissingSummary =
    layoutPolicy.missingDisplayMode === 'summary' && context.missing.length > 0;
  const showMissingList = layoutPolicy.missingDisplayMode === 'full' && context.missing.length > 0;
  const primaryActionLabel = context.ready ? 'Continue to installation' : 'Continue required setup';

  const items: ActionItem[] = [
    {
      id: 'continue',
      label: primaryActionLabel,
      action: 'continue',
    },
    { id: 'cancel', label: 'Cancel', action: 'cancel' },
  ];

  const handleSelect = useCallback(
    (item: ActionItem) => {
      if (item.action === 'cancel') {
        onCancel();
      } else {
        onContinue();
      }
    },
    [onCancel, onContinue],
  );

  return (
    <Box flexDirection="column" marginY={layoutPolicy.showOuterSpacing ? 1 : 0}>
      <Text bold>Install Preparation</Text>
      <Box marginY={layoutPolicy.showStatusSpacing ? 1 : 0} flexDirection="column">
        {statusRows.map((row) => (
          <StatusLine key={row.label} label={row.label} status={row.status} detail={row.detail} />
        ))}
      </Box>

      {showMissingList && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow">Missing setup:</Text>
          {context.missing.map((item) => (
            <Text key={item} color="gray">
              • {item}
            </Text>
          ))}
        </Box>
      )}

      {showMissingSummary && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Missing setup: {context.missing.length} item{context.missing.length === 1 ? '' : 's'}
          </Text>
        </Box>
      )}

      {note ? (
        <Box marginBottom={1}>
          <Text color="yellow">{note}</Text>
        </Box>
      ) : null}

      <GenericSelector items={items} title="" onSelect={handleSelect} onCancel={onCancel} />
    </Box>
  );
}

function TaskHeader({ title, subtitle }: { title: string; subtitle: string }): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{title}</Text>
      <Text color="gray">{subtitle}</Text>
    </Box>
  );
}

function GuidedStepContainer({
  onNext,
  onCancel,
  children,
}: {
  onNext: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  useInput((input, key) => {
    if (key.return || input === ' ') {
      onNext();
      return;
    }

    if (key.escape || isCtrlCInput(input, key)) {
      onCancel();
    }
  });

  return <Box flexDirection="column">{children}</Box>;
}

function getInitialLeafTaskId(taskId: InstallTaskId): InstallLeafTaskId {
  switch (taskId) {
    case 'firebase_config_files':
      return 'firebase_config_detecting';
    case 'apns_key_for_firebase':
      return 'apns_detecting';
    case 'firebase_service_account':
      return 'firebase_service_account_detecting';
    case 'ios_entitlements':
      return 'ios_entitlements_run';
    case 'notification_service_extension':
      return 'nse_prepare_context';
    default:
      return 'firebase_config_detecting';
  }
}

function createInitialFirebaseConfigState(): FirebaseConfigState {
  return {
    detection: null,
    projectType: null,
    service: null,
    projects: [],
    selectedProject: null,
    androidApps: [],
    iosApps: [],
    selectedAndroidApp: null,
    downloadingPlatform: 'both',
    noAppsContext: null,
    creatingAppPlatform: 'android',
    gcpProjects: [],
    selectedGcpProject: null,
    error: null,
  };
}

function createInitialFirebaseServiceAccountState(): FirebaseServiceAccountState {
  return {
    detection: null,
    projectId: null,
    senderConfigUpdatedAt: null,
    serviceAccountJson: null,
    registrationError: null,
    error: null,
    errorNextLeafTaskId: 'firebase_service_account_detecting',
  };
}

function createInitialApnsState(context: PreparationContext): ApnsState {
  return {
    detection: {
      firebaseProjectId: context.firebase.projectId ?? null,
      bundleId: context.ios.bundleId ?? null,
      teamId: context.ios.teamId ?? null,
    },
    acquisition: null,
    selectedProject: null,
  };
}

function createInitialNotificationExtensionState(): NotificationExtensionState {
  return {
    context: null,
    extensionResult: null,
    error: null,
  };
}

function isFirebaseScopeError(error: string): boolean {
  return (
    error.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    error.includes('insufficient authentication scopes') ||
    (error.includes('403') && error.includes('PERMISSION_DENIED')) ||
    error.includes('invalid_grant')
  );
}

/**
 * Install preparation UI component.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Central orchestration for install preparation leaf tasks.
export function InstallPreparationUI({
  projectPath = process.cwd(),
  onComplete,
  onCancel,
}: InstallPreparationUIProps): React.ReactElement {
  const [phase, setPhase] = useState<PreparationPhase>('checking');
  const [context, setContext] = useState<PreparationContext | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<InstallTaskId | null>(null);
  const [activeLeafTaskId, setActiveLeafTaskId] = useState<InstallLeafTaskId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [guidedContextCache, setGuidedContextCache] = useState<IosGuidedContextCache | null>(null);
  const [firebaseConfigState, setFirebaseConfigState] = useState<FirebaseConfigState>(
    createInitialFirebaseConfigState(),
  );
  const [firebaseServiceAccountState, setFirebaseServiceAccountState] =
    useState<FirebaseServiceAccountState>(createInitialFirebaseServiceAccountState());
  const [apnsState, setApnsState] = useState<ApnsState | null>(null);
  const [notificationExtensionState, setNotificationExtensionState] =
    useState<NotificationExtensionState>(createInitialNotificationExtensionState());

  const [firebaseConfigDownloader] = useState(() => new FirebaseDownloader());
  const [serviceAccountDownloader] = useState(() => new FirebaseDownloader());

  const resetTaskRuntimeState = useCallback((preparationContext?: PreparationContext) => {
    setActiveLeafTaskId(null);
    setFirebaseConfigState(createInitialFirebaseConfigState());
    setFirebaseServiceAccountState(createInitialFirebaseServiceAccountState());
    setNotificationExtensionState(createInitialNotificationExtensionState());
    setApnsState(preparationContext ? createInitialApnsState(preparationContext) : null);
  }, []);

  const loadPreparationContext = useCallback(async (): Promise<PreparationContext | null> => {
    const nextContext = await gatherPreparationContext(projectPath);
    if (!nextContext) {
      setContext(null);
      setPhase('config_missing');
      return null;
    }

    setContext(nextContext);
    return nextContext;
  }, [projectPath]);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const nextContext = await gatherPreparationContext(projectPath);
      if (!mounted) {
        return;
      }

      if (!nextContext) {
        setPhase('config_missing');
        return;
      }

      setContext(nextContext);
      setPhase('status');
    };

    void check();

    return () => {
      mounted = false;
    };
  }, [projectPath]);

  const applyTaskCompletion = useCallback(
    async (patch?: TaskCompletionPatch) => {
      const latest = await gatherPreparationContext(projectPath);
      if (!latest) {
        setContext(null);
        setActiveTaskId(null);
        resetTaskRuntimeState();
        setPhase('config_missing');
        return;
      }

      const mergedIos = patch?.ios ? { ...latest.ios, ...patch.ios } : latest.ios;
      const mergedApns = patch?.apns ? { ...latest.apns, ...patch.apns } : latest.apns;

      await saveSetupStatus(projectPath, latest.firebase, mergedIos, mergedApns);

      const refreshed = await loadPreparationContext();
      if (!refreshed) {
        return;
      }

      setActiveTaskId(null);
      resetTaskRuntimeState(refreshed);
      setNote(null);
      setPhase('status');
    },
    [loadPreparationContext, projectPath, resetTaskRuntimeState],
  );

  const handleTaskBackToStatus = useCallback(
    (nextNote?: string) => {
      setActiveTaskId(null);
      resetTaskRuntimeState(context ?? undefined);
      setNote(nextNote ?? 'Setup step was not completed. Continue required setup to proceed.');
      setPhase('status');
    },
    [context, resetTaskRuntimeState],
  );

  const handleContinue = useCallback(() => {
    if (!context) {
      return;
    }

    if (context.ready) {
      onComplete(context);
      return;
    }

    const nextTaskId = getNextIncompleteTaskId(context);
    if (!nextTaskId) {
      setNote('Unable to determine the next required setup. Try again.');
      return;
    }

    setNote(null);
    setActiveTaskId(nextTaskId);
    setActiveLeafTaskId(getInitialLeafTaskId(nextTaskId));
    setFirebaseConfigState(createInitialFirebaseConfigState());
    setFirebaseServiceAccountState(createInitialFirebaseServiceAccountState());
    setNotificationExtensionState(createInitialNotificationExtensionState());
    setApnsState(createInitialApnsState(context));
    setPhase('task');
  }, [context, onComplete]);

  const handleCancelPreparation = useCallback(() => {
    setPhase('cancelled');
    onCancel();
  }, [onCancel]);

  const getFirebaseConfigNeeds = useCallback((detection: FirebaseDetectionResult | null) => {
    const platform = detection?.platform ?? 'unknown';
    const needsAndroid = firebaseConfigNeedsAndroid(platform);
    const needsIos = firebaseConfigNeedsIos(platform);
    const needsAndroidConfig = needsAndroid && !detection?.android?.valid;
    const needsIosConfig = needsIos && !detection?.ios?.valid;
    const forceDownload = platform === 'unknown';

    return {
      shouldFetchAndroid: needsAndroidConfig || (forceDownload && needsAndroid),
      shouldFetchIos: needsIosConfig || (forceDownload && needsIos),
    };
  }, []);

  const startFirebaseConfigDownload = useCallback(
    async (project: FirebaseProject, androidApp: AndroidApp | null, iosApp: IosApp | null) => {
      const projectType = firebaseConfigState.projectType;
      if (!projectType) {
        setFirebaseConfigState((prev) => ({
          ...prev,
          error: 'Project type not detected for Firebase download.',
        }));
        setActiveLeafTaskId('firebase_config_error');
        return;
      }

      const downloadingPlatform: 'android' | 'ios' | 'both' =
        androidApp && iosApp ? 'both' : androidApp ? 'android' : 'ios';
      setFirebaseConfigState((prev) => ({ ...prev, downloadingPlatform }));
      setActiveLeafTaskId('firebase_config_downloading');

      try {
        const paths = firebaseConfigDownloader.getExpectedSavePaths(projectPath, projectType);

        if (androidApp && paths.android) {
          await firebaseConfigDownloader.downloadAndroidConfig(
            project.projectId,
            androidApp.appId,
            paths.android,
          );
        }

        if (iosApp && paths.ios) {
          await firebaseConfigDownloader.downloadIosConfig(
            project.projectId,
            iosApp.appId,
            paths.ios,
          );
        }

        const service =
          firebaseConfigState.service ?? new FirebaseService(projectPath, projectType);
        const newDetection = await service.detect();
        setFirebaseConfigState((prev) => ({ ...prev, service, detection: newDetection }));

        if (hasValidFirebaseConfigTaskFiles(newDetection)) {
          await applyTaskCompletion();
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          error: 'Downloaded files could not be validated. Verify files and retry.',
        }));
        setActiveLeafTaskId('firebase_config_error');
      } catch (err) {
        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Download failed',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    },
    [
      applyTaskCompletion,
      firebaseConfigDownloader,
      firebaseConfigState.projectType,
      firebaseConfigState.service,
      projectPath,
    ],
  );

  const handleFirebaseConfigProjectSelect = useCallback(
    async (project: FirebaseProject) => {
      setFirebaseConfigState((prev) => ({ ...prev, selectedProject: project, error: null }));

      const { shouldFetchAndroid, shouldFetchIos } = getFirebaseConfigNeeds(
        firebaseConfigState.detection,
      );
      if (!shouldFetchAndroid && !shouldFetchIos) {
        await applyTaskCompletion();
        return;
      }

      let selectedAndroidApp: AndroidApp | null = null;
      let selectedIosApp: IosApp | null = null;
      let noAndroidApps = false;
      let noIosApps = false;

      try {
        if (shouldFetchAndroid) {
          const androidApps = await firebaseConfigDownloader.listAndroidApps(project.projectId);
          if (androidApps.length === 0) {
            noAndroidApps = true;
            setFirebaseConfigState((prev) => ({
              ...prev,
              androidApps: [],
              selectedAndroidApp: null,
            }));
          } else if (androidApps.length > 1) {
            setFirebaseConfigState((prev) => ({ ...prev, androidApps, selectedAndroidApp: null }));
            setActiveLeafTaskId('firebase_config_select_android_app');
            return;
          } else {
            selectedAndroidApp = androidApps[0];
            setFirebaseConfigState((prev) => ({
              ...prev,
              androidApps,
              selectedAndroidApp: selectedAndroidApp,
            }));
          }
        }

        if (shouldFetchIos) {
          const iosApps = await firebaseConfigDownloader.listIosApps(project.projectId);
          if (iosApps.length === 0) {
            noIosApps = true;
            setFirebaseConfigState((prev) => ({ ...prev, iosApps }));
          } else if (iosApps.length > 1) {
            setFirebaseConfigState((prev) => ({ ...prev, iosApps }));
            setActiveLeafTaskId('firebase_config_select_ios_app');
            return;
          } else {
            selectedIosApp = iosApps[0];
            setFirebaseConfigState((prev) => ({ ...prev, iosApps }));
          }
        }

        if ((shouldFetchAndroid && noAndroidApps) || (shouldFetchIos && noIosApps)) {
          setFirebaseConfigState((prev) => ({
            ...prev,
            noAppsContext: {
              noAndroidApps,
              noIosApps,
              needsAndroid: shouldFetchAndroid,
              needsIos: shouldFetchIos,
            },
          }));
          setActiveLeafTaskId('firebase_config_no_apps_found');
          return;
        }

        await startFirebaseConfigDownload(project, selectedAndroidApp, selectedIosApp);
      } catch (err) {
        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to fetch Firebase apps',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    },
    [
      applyTaskCompletion,
      firebaseConfigDownloader,
      firebaseConfigState.detection,
      getFirebaseConfigNeeds,
      startFirebaseConfigDownload,
    ],
  );

  const handleFirebaseConfigAndroidAppSelect = useCallback(
    async (app: AndroidApp) => {
      const project = firebaseConfigState.selectedProject;
      if (!project) {
        setFirebaseConfigState((prev) => ({ ...prev, error: 'No Firebase project selected.' }));
        setActiveLeafTaskId('firebase_config_error');
        return;
      }

      setFirebaseConfigState((prev) => ({ ...prev, selectedAndroidApp: app }));
      const { shouldFetchIos } = getFirebaseConfigNeeds(firebaseConfigState.detection);

      if (!shouldFetchIos) {
        await startFirebaseConfigDownload(project, app, null);
        return;
      }

      try {
        const iosApps = await firebaseConfigDownloader.listIosApps(project.projectId);
        setFirebaseConfigState((prev) => ({ ...prev, iosApps }));

        if (iosApps.length === 0) {
          await startFirebaseConfigDownload(project, app, null);
          return;
        }

        if (iosApps.length === 1) {
          await startFirebaseConfigDownload(project, app, iosApps[0]);
          return;
        }

        setActiveLeafTaskId('firebase_config_select_ios_app');
      } catch {
        await startFirebaseConfigDownload(project, app, null);
      }
    },
    [
      firebaseConfigDownloader,
      firebaseConfigState.detection,
      firebaseConfigState.selectedProject,
      getFirebaseConfigNeeds,
      startFirebaseConfigDownload,
    ],
  );

  const handleFirebaseConfigCreateApp = useCallback(
    async (platform: 'android' | 'ios', identifier: string, displayName?: string) => {
      const selectedProject = firebaseConfigState.selectedProject;
      if (!selectedProject) {
        setFirebaseConfigState((prev) => ({ ...prev, error: 'No Firebase project selected.' }));
        setActiveLeafTaskId('firebase_config_error');
        return;
      }

      setFirebaseConfigState((prev) => ({ ...prev, creatingAppPlatform: platform }));
      setActiveLeafTaskId('firebase_config_creating_app');

      try {
        if (platform === 'android') {
          const androidApp = await firebaseConfigDownloader.createAndroidApp(
            selectedProject.projectId,
            {
              packageName: identifier,
              displayName,
            },
          );

          setFirebaseConfigState((prev) => ({
            ...prev,
            androidApps: [androidApp],
            selectedAndroidApp: androidApp,
          }));

          const { shouldFetchIos } = getFirebaseConfigNeeds(firebaseConfigState.detection);
          if (!shouldFetchIos) {
            await startFirebaseConfigDownload(selectedProject, androidApp, null);
            return;
          }

          const iosApps = await firebaseConfigDownloader.listIosApps(selectedProject.projectId);
          setFirebaseConfigState((prev) => ({ ...prev, iosApps }));

          if (iosApps.length === 0) {
            setFirebaseConfigState((prev) => ({
              ...prev,
              noAppsContext: {
                noAndroidApps: false,
                noIosApps: true,
                needsAndroid: false,
                needsIos: true,
              },
            }));
            setActiveLeafTaskId('firebase_config_no_apps_found');
            return;
          }

          if (iosApps.length === 1) {
            await startFirebaseConfigDownload(selectedProject, androidApp, iosApps[0]);
            return;
          }

          setActiveLeafTaskId('firebase_config_select_ios_app');
          return;
        }

        const iosApp = await firebaseConfigDownloader.createIosApp(selectedProject.projectId, {
          bundleId: identifier,
          displayName,
        });

        await startFirebaseConfigDownload(
          selectedProject,
          firebaseConfigState.selectedAndroidApp,
          iosApp,
        );
      } catch (err) {
        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to create Firebase app',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    },
    [
      firebaseConfigDownloader,
      firebaseConfigState.detection,
      firebaseConfigState.selectedAndroidApp,
      firebaseConfigState.selectedProject,
      getFirebaseConfigNeeds,
      startFirebaseConfigDownload,
    ],
  );

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_config_files' ||
      activeLeafTaskId !== 'firebase_config_detecting'
    ) {
      return;
    }

    let cancelled = false;

    const detect = async () => {
      try {
        const detectedProjectType = context?.projectType ?? (await detectProjectType(projectPath));
        const service = new FirebaseService(projectPath, detectedProjectType);
        const detection = await service.detect();

        if (cancelled) {
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          projectType: detectedProjectType,
          service,
          detection,
          error: null,
        }));

        if (hasValidFirebaseConfigTaskFiles(detection)) {
          await applyTaskCompletion();
          return;
        }

        setActiveLeafTaskId('firebase_config_status');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to detect Firebase config',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    applyTaskCompletion,
    context?.projectType,
    phase,
    projectPath,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_config_files' ||
      activeLeafTaskId !== 'firebase_config_authenticating'
    ) {
      return;
    }

    let cancelled = false;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Step branching mirrors Firebase setup decision tree.
    const authenticate = async () => {
      try {
        if (!isOAuthConfigured()) {
          throw new Error('Google OAuth is not configured. Set Firebase OAuth credentials first.');
        }

        const isAuthenticated = await firebaseConfigDownloader.isAuthenticated();
        if (!isAuthenticated) {
          const authResult = await firebaseConfigDownloader.authenticate(openBrowser);
          if (!authResult.success) {
            throw new Error(authResult.error || 'Firebase authentication failed.');
          }
        }

        const projects = await firebaseConfigDownloader.listProjects();
        if (cancelled) {
          return;
        }

        if (projects.length === 0) {
          setActiveLeafTaskId('firebase_config_no_projects');
          return;
        }

        setFirebaseConfigState((prev) => ({ ...prev, projects }));
        if (projects.length === 1) {
          await handleFirebaseConfigProjectSelect(projects[0]);
          return;
        }

        setActiveLeafTaskId('firebase_config_select_project');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to authenticate Firebase',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    };

    void authenticate();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    firebaseConfigDownloader,
    handleFirebaseConfigProjectSelect,
    phase,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_config_files' ||
      activeLeafTaskId !== 'firebase_config_select_gcp_project'
    ) {
      return;
    }

    if (firebaseConfigState.gcpProjects.length > 0) {
      return;
    }

    let cancelled = false;

    const fetchGcpProjects = async () => {
      try {
        const available = await firebaseConfigDownloader.listAvailableGcpProjects();
        if (cancelled) {
          return;
        }

        if (available.length === 0) {
          throw new Error('No GCP projects available to add Firebase.');
        }

        setFirebaseConfigState((prev) => ({ ...prev, gcpProjects: available }));
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to fetch GCP projects',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    };

    void fetchGcpProjects();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    firebaseConfigDownloader,
    firebaseConfigState.gcpProjects.length,
    phase,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_config_files' ||
      activeLeafTaskId !== 'firebase_config_adding_firebase'
    ) {
      return;
    }

    if (!firebaseConfigState.selectedGcpProject) {
      setFirebaseConfigState((prev) => ({ ...prev, error: 'No GCP project selected.' }));
      setActiveLeafTaskId('firebase_config_error');
      return;
    }

    let cancelled = false;

    const addFirebase = async () => {
      try {
        const project = await firebaseConfigDownloader.addFirebaseToProject(
          firebaseConfigState.selectedGcpProject?.projectId || '',
        );

        if (cancelled) {
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          projects: [project],
          selectedProject: project,
        }));
        await handleFirebaseConfigProjectSelect(project);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseConfigState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to add Firebase to GCP project',
        }));
        setActiveLeafTaskId('firebase_config_error');
      }
    };

    void addFirebase();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    firebaseConfigDownloader,
    firebaseConfigState.selectedGcpProject,
    handleFirebaseConfigProjectSelect,
    phase,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_service_account' ||
      activeLeafTaskId !== 'firebase_service_account_detecting'
    ) {
      return;
    }

    let cancelled = false;

    const detect = async () => {
      try {
        const detectedProjectType = context?.projectType ?? (await detectProjectType(projectPath));
        const firebaseService = new FirebaseService(projectPath, detectedProjectType);
        const detection = await firebaseService.detect();

        if (cancelled) {
          return;
        }

        setFirebaseServiceAccountState((prev) => ({ ...prev, detection, error: null }));

        if (!hasValidServiceAccountConfigFiles(detection)) {
          setFirebaseServiceAccountState((prev) => ({
            ...prev,
            error: 'Firebase Configuration Files are missing. Complete that step first.',
            errorNextLeafTaskId: 'firebase_service_account_detecting',
          }));
          setActiveLeafTaskId('firebase_service_account_error');
          return;
        }

        const projectId = getFirebaseProjectIdFromConfig(detection);
        if (!projectId) {
          setFirebaseServiceAccountState((prev) => ({
            ...prev,
            error: 'Unable to determine Firebase Project ID from config files.',
            errorNextLeafTaskId: 'firebase_service_account_detecting',
          }));
          setActiveLeafTaskId('firebase_service_account_error');
          return;
        }

        setFirebaseServiceAccountState((prev) => ({
          ...prev,
          projectId,
          error: null,
        }));
        setActiveLeafTaskId(
          context?.config.project.id
            ? 'firebase_service_account_checking_sender_config'
            : 'firebase_service_account_input',
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseServiceAccountState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to detect Firebase config.',
          errorNextLeafTaskId: 'firebase_service_account_detecting',
        }));
        setActiveLeafTaskId('firebase_service_account_error');
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    context?.config.project.id,
    context?.projectType,
    phase,
    projectPath,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_service_account' ||
      activeLeafTaskId !== 'firebase_service_account_checking_sender_config'
    ) {
      return;
    }

    const clixProjectId = context?.config.project.id;
    if (!clixProjectId) {
      setActiveLeafTaskId('firebase_service_account_input');
      return;
    }

    let cancelled = false;

    const checkSenderConfig = async () => {
      try {
        const { getInternalApiClient } = await import('@/lib/api');
        const project = await getInternalApiClient().getProject(clixProjectId);
        const pushConfig = project.sender_configs?.find(
          (config) => config.channel_type === 'CHANNEL_TYPE_APP_PUSH',
        );

        if (cancelled) {
          return;
        }

        if (pushConfig) {
          setFirebaseServiceAccountState((prev) => ({
            ...prev,
            senderConfigUpdatedAt: pushConfig.updated_at ?? pushConfig.created_at ?? null,
          }));
          setActiveLeafTaskId('firebase_service_account_registered');
          return;
        }

        setActiveLeafTaskId('firebase_service_account_input');
      } catch {
        if (cancelled) {
          return;
        }

        setActiveLeafTaskId('firebase_service_account_input');
      }
    };

    void checkSenderConfig();

    return () => {
      cancelled = true;
    };
  }, [activeLeafTaskId, activeTaskId, context?.config.project.id, phase]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_service_account' ||
      activeLeafTaskId !== 'firebase_service_account_saving'
    ) {
      return;
    }

    const json = firebaseServiceAccountState.serviceAccountJson;
    if (!json) {
      setFirebaseServiceAccountState((prev) => ({
        ...prev,
        error: 'Service account JSON is missing. Paste it again.',
        errorNextLeafTaskId: 'firebase_service_account_input',
      }));
      setActiveLeafTaskId('firebase_service_account_error');
      return;
    }

    let cancelled = false;

    const saveServiceAccountJson = async () => {
      try {
        await serviceAccountDownloader.saveServiceAccountJson(projectPath, json);
        if (cancelled) {
          return;
        }

        if (!context?.config.project.id) {
          await applyTaskCompletion();
          return;
        }

        setActiveLeafTaskId('firebase_service_account_registering');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseServiceAccountState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to save service account JSON.',
          errorNextLeafTaskId: 'firebase_service_account_input',
        }));
        setActiveLeafTaskId('firebase_service_account_error');
      }
    };

    void saveServiceAccountJson();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    applyTaskCompletion,
    context?.config.project.id,
    firebaseServiceAccountState.serviceAccountJson,
    phase,
    projectPath,
    serviceAccountDownloader,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'firebase_service_account' ||
      activeLeafTaskId !== 'firebase_service_account_registering'
    ) {
      return;
    }

    const clixProjectId = context?.config.project.id;
    if (!clixProjectId) {
      void applyTaskCompletion();
      return;
    }

    let cancelled = false;

    const registerSenderConfig = async () => {
      try {
        const { getInternalApiClient } = await import('@/lib/api');
        const apiClient = getInternalApiClient();
        const serviceAccount =
          firebaseServiceAccountState.serviceAccountJson ??
          (await serviceAccountDownloader.loadServiceAccountJson(projectPath));

        if (!serviceAccount) {
          throw new Error('Service account JSON not found. Import the key again and retry.');
        }

        const encoded = Buffer.from(JSON.stringify(serviceAccount), 'utf-8').toString('base64');
        await apiClient.createOrUpdateSenderConfig(clixProjectId, {
          channel_type: 'CHANNEL_TYPE_APP_PUSH',
          app_push: {
            ios_config: { fcm_sa_json_base64_encoded: encoded },
            android_config: { fcm_sa_json_base64_encoded: encoded },
          },
        });

        if (cancelled) {
          return;
        }

        await applyTaskCompletion();
      } catch (err) {
        if (cancelled) {
          return;
        }

        setFirebaseServiceAccountState((prev) => ({
          ...prev,
          registrationError:
            err instanceof Error ? err.message : 'Unknown error while registering sender config',
        }));
        setActiveLeafTaskId('firebase_service_account_registration_failed');
      }
    };

    void registerSenderConfig();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    applyTaskCompletion,
    context?.config.project.id,
    firebaseServiceAccountState.serviceAccountJson,
    phase,
    projectPath,
    serviceAccountDownloader,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_prepare_context'
    ) {
      return;
    }

    let cancelled = false;

    const prepareContext = async () => {
      try {
        const nextContext = await buildNotificationExtensionContext(
          projectPath,
          context?.ios.bundleId,
          context?.ios.appGroupId,
          guidedContextCache,
        );

        if (cancelled) {
          return;
        }

        setGuidedContextCache(nextContext);
        setNotificationExtensionState((prev) => ({ ...prev, context: nextContext, error: null }));
        setActiveLeafTaskId('nse_create_files');
      } catch (err) {
        if (cancelled) {
          return;
        }

        handleTaskBackToStatus(err instanceof Error ? err.message : 'Failed to prepare NSE setup');
      }
    };

    void prepareContext();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    context?.ios.appGroupId,
    context?.ios.bundleId,
    guidedContextCache,
    handleTaskBackToStatus,
    phase,
    projectPath,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_create_files'
    ) {
      return;
    }

    const nseContext = notificationExtensionState.context;
    if (!nseContext) {
      handleTaskBackToStatus('Notification extension context is missing.');
      return;
    }

    let cancelled = false;

    const createFiles = async () => {
      const extensionContext: ExtensionContext = {
        appName: nseContext.appName,
        bundleId: nseContext.bundleId,
        iosDir: nseContext.iosDir,
      };

      const result = await createExtensionFiles(extensionContext);
      if (cancelled) {
        return;
      }

      setNotificationExtensionState((prev) => ({ ...prev, extensionResult: result }));
      if (!result.success) {
        setNotificationExtensionState((prev) => ({
          ...prev,
          error: result.error || 'Failed to create extension files',
        }));
        setActiveLeafTaskId('nse_complete');
        return;
      }

      setActiveLeafTaskId('nse_xcode_target');
    };

    void createFiles();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    handleTaskBackToStatus,
    notificationExtensionState.context,
    phase,
  ]);

  if (phase === 'checking') {
    return <CheckingPhase />;
  }

  if (phase === 'config_missing') {
    return <ConfigMissingPhase onCancel={handleCancelPreparation} />;
  }

  if (phase === 'cancelled') {
    return (
      <Box marginY={1}>
        <Text color="yellow">Installation cancelled.</Text>
      </Box>
    );
  }

  if (!context) {
    return <CheckingPhase />;
  }

  if (phase === 'status' || !activeTaskId || !activeLeafTaskId) {
    return (
      <StatusPhase
        context={context}
        note={note}
        onContinue={handleContinue}
        onCancel={handleCancelPreparation}
      />
    );
  }

  switch (activeTaskId) {
    case 'firebase_config_files': {
      const detection = firebaseConfigState.detection;
      const selectedProject = firebaseConfigState.selectedProject;

      return (
        <Box flexDirection="column">
          <TaskHeader
            title="Firebase Configuration Files"
            subtitle="Set up Firebase configuration files before continuing."
          />

          {activeLeafTaskId === 'firebase_config_detecting' && <FirebaseConfigDetectingTask />}

          {activeLeafTaskId === 'firebase_config_status' && detection && (
            <FirebaseConfigStatusTask
              result={detection}
              onContinue={() => setActiveLeafTaskId('firebase_config_authenticating')}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_config_authenticating' && (
            <FirebaseConfigAuthenticatingTask onCancel={() => handleTaskBackToStatus()} />
          )}

          {activeLeafTaskId === 'firebase_config_select_project' && (
            <FirebaseConfigProjectSelectorTask
              projects={firebaseConfigState.projects}
              onSelect={(project) => {
                void handleFirebaseConfigProjectSelect(project);
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_config_select_android_app' && (
            <FirebaseConfigAppSelectorTask
              apps={firebaseConfigState.androidApps}
              platform="android"
              onSelect={(app) => {
                void handleFirebaseConfigAndroidAppSelect(app as AndroidApp);
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_config_select_ios_app' && (
            <FirebaseConfigAppSelectorTask
              apps={firebaseConfigState.iosApps}
              platform="ios"
              onSelect={(app) => {
                if (!selectedProject) {
                  handleTaskBackToStatus('No Firebase project selected.');
                  return;
                }

                void startFirebaseConfigDownload(
                  selectedProject,
                  firebaseConfigState.selectedAndroidApp,
                  app as IosApp,
                );
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_config_no_apps_found' && (
            <FirebaseConfigNoAppsFoundTask
              context={
                firebaseConfigState.noAppsContext || {
                  noAndroidApps: true,
                  noIosApps: true,
                  needsAndroid: true,
                  needsIos: true,
                }
              }
              onCreateAndroid={() => setActiveLeafTaskId('firebase_config_create_android_app')}
              onCreateIos={() => setActiveLeafTaskId('firebase_config_create_ios_app')}
              onCancel={() => setActiveLeafTaskId('firebase_config_select_project')}
            />
          )}

          {activeLeafTaskId === 'firebase_config_create_android_app' && (
            <FirebaseConfigCreateAppInputTask
              platform="android"
              onSubmit={(identifier, displayName) => {
                void handleFirebaseConfigCreateApp('android', identifier, displayName);
              }}
              onCancel={() => setActiveLeafTaskId('firebase_config_no_apps_found')}
            />
          )}

          {activeLeafTaskId === 'firebase_config_create_ios_app' && (
            <FirebaseConfigCreateAppInputTask
              platform="ios"
              onSubmit={(identifier, displayName) => {
                void handleFirebaseConfigCreateApp('ios', identifier, displayName);
              }}
              onCancel={() => setActiveLeafTaskId('firebase_config_no_apps_found')}
            />
          )}

          {activeLeafTaskId === 'firebase_config_creating_app' && (
            <FirebaseConfigCreatingAppTask platform={firebaseConfigState.creatingAppPlatform} />
          )}

          {activeLeafTaskId === 'firebase_config_no_projects' && (
            <FirebaseConfigNoProjectsTask
              onOpenConsole={() => {
                openBrowser(FIREBASE_HELP_URLS.console);
                setActiveLeafTaskId('firebase_config_detecting');
              }}
              onSelectGcp={() => {
                setFirebaseConfigState((prev) => ({ ...prev, gcpProjects: [] }));
                setActiveLeafTaskId('firebase_config_select_gcp_project');
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_config_select_gcp_project' &&
            (firebaseConfigState.gcpProjects.length > 0 ? (
              <FirebaseConfigGcpProjectSelectorTask
                projects={firebaseConfigState.gcpProjects}
                onSelect={(project) => {
                  setFirebaseConfigState((prev) => ({ ...prev, selectedGcpProject: project }));
                  setActiveLeafTaskId('firebase_config_adding_firebase');
                }}
                onCancel={() => setActiveLeafTaskId('firebase_config_no_projects')}
              />
            ) : (
              <FirebaseConfigAuthenticatingTask onCancel={() => handleTaskBackToStatus()} />
            ))}

          {activeLeafTaskId === 'firebase_config_adding_firebase' && (
            <FirebaseConfigAddingFirebaseTask
              projectId={firebaseConfigState.selectedGcpProject?.projectId || ''}
            />
          )}

          {activeLeafTaskId === 'firebase_config_downloading' && (
            <FirebaseConfigDownloadingTask platform={firebaseConfigState.downloadingPlatform} />
          )}

          {activeLeafTaskId === 'firebase_config_error' && (
            <FirebaseConfigErrorTask
              error={firebaseConfigState.error || 'Unknown Firebase configuration error'}
              onRetry={() => {
                const error = firebaseConfigState.error || '';
                setFirebaseConfigState((prev) => ({ ...prev, error: null }));

                if (isFirebaseScopeError(error)) {
                  void firebaseConfigDownloader.logout();
                  setActiveLeafTaskId('firebase_config_authenticating');
                  return;
                }

                setActiveLeafTaskId('firebase_config_detecting');
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}
        </Box>
      );
    }

    case 'apns_key_for_firebase': {
      const currentApnsState = apnsState ?? createInitialApnsState(context);
      const registrationContext: PushSetupContext = {
        bundleId: currentApnsState.detection.bundleId,
        firebaseProjectId: currentApnsState.detection.firebaseProjectId,
        pushKey: currentApnsState.acquisition?.pushKey ?? null,
        p8FilePath: currentApnsState.acquisition?.p8FilePath ?? null,
      };

      return (
        <Box flexDirection="column">
          <TaskHeader
            title="APNS Key for Firebase"
            subtitle="Register your APNS key in Firebase Cloud Messaging."
          />

          {activeLeafTaskId === 'apns_detecting' && (
            <PushDetectionTask
              projectPath={context.projectPath}
              preDetectedBundleId={context.ios.bundleId}
              preDetectedFirebaseProjectId={context.firebase.projectId ?? null}
              preDetectedTeamId={context.ios.teamId ?? null}
              onComplete={(result) => {
                setApnsState((prev) => ({
                  ...(prev || createInitialApnsState(context)),
                  detection: result,
                }));
                setActiveLeafTaskId('apns_input');
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'apns_input' && (
            <ApnsKeyAcquisitionTask
              projectPath={context.projectPath}
              suggestedTeamId={currentApnsState.detection.teamId}
              onComplete={(result) => {
                setApnsState((prev) => ({
                  ...(prev || createInitialApnsState(context)),
                  acquisition: result,
                }));

                setActiveLeafTaskId(
                  isOAuthConfigured() ? 'apns_select_firebase_project' : 'apns_registering',
                );
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'apns_select_firebase_project' && (
            <FirebaseProjectSelectionTask
              preferredProjectId={currentApnsState.detection.firebaseProjectId}
              onComplete={(project) => {
                setApnsState((prev) => ({
                  ...(prev || createInitialApnsState(context)),
                  selectedProject: project,
                }));
                setActiveLeafTaskId('apns_registering');
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'apns_registering' &&
            (registrationContext.pushKey ? (
              <FirebaseApnsRegistrationTask
                context={registrationContext}
                selectedProject={currentApnsState.selectedProject}
                onComplete={() => {
                  void applyTaskCompletion({
                    apns: {
                      needed: context.apns.needed,
                      registeredWithFirebase: true,
                      keyId: registrationContext.pushKey?.apnsKeyId,
                      teamId: registrationContext.pushKey?.teamId,
                    },
                  });
                }}
                onCancel={() => handleTaskBackToStatus()}
              />
            ) : (
              <Box flexDirection="column" marginY={1}>
                <Text color="red">✗ APNS key data is missing. Retry this step.</Text>
              </Box>
            ))}
        </Box>
      );
    }

    case 'firebase_service_account':
      return (
        <Box flexDirection="column">
          <TaskHeader
            title="Firebase Service Account"
            subtitle="Register the Firebase Service Account before continuing."
          />

          {activeLeafTaskId === 'firebase_service_account_detecting' && (
            <FirebaseServiceAccountDetectingTask />
          )}

          {activeLeafTaskId === 'firebase_service_account_checking_sender_config' && (
            <FirebaseServiceAccountCheckingSenderConfigTask />
          )}

          {activeLeafTaskId === 'firebase_service_account_registered' && (
            <FirebaseServiceAccountRegisteredTask
              updatedAt={firebaseServiceAccountState.senderConfigUpdatedAt}
              onContinue={() => {
                void applyTaskCompletion();
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_service_account_input' && (
            <FirebaseServiceAccountPasteTask
              projectId={firebaseServiceAccountState.projectId || ''}
              onSubmit={(json) => {
                setFirebaseServiceAccountState((prev) => ({
                  ...prev,
                  serviceAccountJson: json,
                  registrationError: null,
                  error: null,
                }));
                setActiveLeafTaskId('firebase_service_account_saving');
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_service_account_saving' && (
            <FirebaseServiceAccountSavingTask />
          )}

          {activeLeafTaskId === 'firebase_service_account_registering' && (
            <FirebaseServiceAccountRegisteringTask />
          )}

          {activeLeafTaskId === 'firebase_service_account_registration_failed' && (
            <FirebaseServiceAccountRegistrationFailedTask
              error={
                firebaseServiceAccountState.registrationError ||
                'Unknown error while registering sender config'
              }
              onRetry={() => setActiveLeafTaskId('firebase_service_account_input')}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}

          {activeLeafTaskId === 'firebase_service_account_error' && (
            <FirebaseServiceAccountErrorTask
              error={firebaseServiceAccountState.error || 'Unknown service account error'}
              onRetry={() => {
                setFirebaseServiceAccountState((prev) => ({ ...prev, error: null }));
                setActiveLeafTaskId(firebaseServiceAccountState.errorNextLeafTaskId);
              }}
              onCancel={() => handleTaskBackToStatus()}
            />
          )}
        </Box>
      );

    case 'ios_entitlements':
      return (
        <Box flexDirection="column">
          <TaskHeader
            title="iOS Entitlements"
            subtitle="Configure required iOS entitlements for push notifications."
          />
          <IosEntitlementsTask
            onComplete={(result: IosEntitlementsTaskResult) => {
              if (!result.success) {
                handleTaskBackToStatus(result.error || undefined);
                return;
              }

              if (result.agentContext) {
                setGuidedContextCache({
                  bundleId: result.agentContext.bundleId,
                  appGroupId: result.agentContext.appGroupId,
                  appName: result.agentContext.appName,
                  iosDir: result.agentContext.iosDir,
                  entitlementsPath: result.agentContext.entitlementsPath,
                });
              }

              void applyTaskCompletion({
                ios: {
                  needed: context.ios.needed,
                  bundleId: result.bundleId ?? context.ios.bundleId,
                  teamId: result.teamId ?? context.ios.teamId,
                  appGroupId: result.agentContext?.appGroupId ?? context.ios.appGroupId,
                  entitlementsConfigured: true,
                },
              });
            }}
          />
        </Box>
      );

    case 'notification_service_extension': {
      const nseContext = notificationExtensionState.context;
      const extensionResult = notificationExtensionState.extensionResult;
      const extensionName = nseContext ? getExtensionName(nseContext.appName) : '';
      const extensionBundleId = nseContext
        ? getExtensionBundleId(nseContext.bundleId, nseContext.appName)
        : '';

      return (
        <Box flexDirection="column">
          <TaskHeader
            title="Notification Service Extension"
            subtitle="Create and verify Notification Service Extension setup."
          />

          {activeLeafTaskId === 'nse_prepare_context' && (
            <Box flexDirection="column" marginY={1}>
              <Box>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text> Preparing extension setup context...</Text>
              </Box>
            </Box>
          )}

          {activeLeafTaskId === 'nse_create_files' && (
            <Box flexDirection="column" marginY={1}>
              <Box>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text> Creating Notification Service Extension files...</Text>
              </Box>
            </Box>
          )}

          {activeLeafTaskId === 'nse_xcode_target' && nseContext && (
            <GuidedStepContainer
              onNext={() => setActiveLeafTaskId('nse_build_settings')}
              onCancel={() => handleTaskBackToStatus()}
            >
              <NotificationExtensionXcodeTask
                extensionName={extensionName}
                extensionBundleId={extensionBundleId}
                extensionResult={extensionResult}
                appGroupId={nseContext.appGroupId}
              />
            </GuidedStepContainer>
          )}

          {activeLeafTaskId === 'nse_build_settings' && nseContext && (
            <GuidedStepContainer
              onNext={() => setActiveLeafTaskId('nse_dependencies')}
              onCancel={() => handleTaskBackToStatus()}
            >
              <NotificationExtensionBuildSettingsTask
                extensionName={extensionName}
                entitlementsPath={nseContext.entitlementsPath}
              />
            </GuidedStepContainer>
          )}

          {activeLeafTaskId === 'nse_dependencies' && (
            <GuidedStepContainer
              onNext={() => setActiveLeafTaskId('nse_verification')}
              onCancel={() => handleTaskBackToStatus()}
            >
              <NotificationExtensionDependenciesTask extensionName={extensionName} />
            </GuidedStepContainer>
          )}

          {activeLeafTaskId === 'nse_verification' && nseContext && (
            <GuidedStepContainer
              onNext={() => {
                const verification = verifyExtensionFiles(nseContext.iosDir, nseContext.appName);
                if (!verification.complete) {
                  handleTaskBackToStatus('Notification Service Extension files are still missing.');
                  return;
                }
                setActiveLeafTaskId('nse_complete');
              }}
              onCancel={() => handleTaskBackToStatus()}
            >
              <NotificationExtensionVerificationTask
                context={nseContext}
                extensionResult={extensionResult}
              />
            </GuidedStepContainer>
          )}

          {activeLeafTaskId === 'nse_complete' && (
            <GuidedStepContainer
              onNext={() => {
                if (notificationExtensionState.error) {
                  handleTaskBackToStatus(notificationExtensionState.error);
                  return;
                }
                void applyTaskCompletion({
                  ios: {
                    needed: context.ios.needed,
                    nseConfigured: true,
                  },
                });
              }}
              onCancel={() => handleTaskBackToStatus()}
            >
              <NotificationExtensionCompleteTask
                error={notificationExtensionState.error}
                extensionResult={extensionResult}
              />
            </GuidedStepContainer>
          )}
        </Box>
      );
    }

    default:
      return (
        <StatusPhase
          context={context}
          note={note}
          onContinue={handleContinue}
          onCancel={handleCancelPreparation}
        />
      );
  }
}
