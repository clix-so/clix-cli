/**
 * Install preparation UI component.
 *
 * Uses a single task orchestrator to enforce required setup order
 * before SDK installation.
 *
 * @module ui/components/InstallPreparationUI
 */

import * as path from 'node:path';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApnsStatus, IosStatus, PreparationContext } from '@/commands/skill/preparation';
import { gatherPreparationContext, saveSetupStatus } from '@/commands/skill/preparation';
import { openBrowser } from '@/lib/auth/browser';
import type { ProjectType } from '@/lib/config';
import {
  addClixToExtensionTarget,
  addNotificationServiceExtension,
  analyzeIosProject,
  createExtensionFiles,
  type ExtensionContext,
  type ExtensionGeneratorResult,
  ensureNotificationServiceSwiftProjectId,
  generateAppGroupId,
  getEntitlementsPath,
  getExtensionBundleId,
  getExtensionName,
  getIosProjectDir,
  getNotificationServiceExtensionStatus,
  hasClixPodInExtensionTarget,
  hasExtensionTarget,
  hasNotificationServiceExtension,
  hasPodfile,
  inspectNotificationServiceSwift,
  type PbxprojModificationResult,
  type PodfileModificationResult,
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
import { ChatMessageList, type ChatMessageListMessage } from '@/ui/components/ChatMessageList';
import { useCancelInput } from '@/ui/hooks';
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
  getTaskRuntimeState,
  INSTALL_TASK_LABELS,
  type InstallTaskId,
  isRuntimeTask,
  isTaskCompleted,
  type RuntimeTaskStateMap,
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
  type NotificationExtensionVerificationChecks,
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
  | 'nse_complete'
  | 'project_build_running'
  | 'project_build_failed'
  | 'project_build_succeeded'
  | 'install_skill_running'
  | 'install_skill_failed'
  | 'install_skill_succeeded';

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
const TASK_OVERRIDE_ENV_NAME = 'CLIX_DEV_ENABLE_TASK_OVERRIDE';
const START_TASK_ENV_NAME = 'CLIX_INSTALL_START_TASK';
const INSTALL_TASK_IDS = Object.keys(INSTALL_TASK_LABELS) as InstallTaskId[];

interface InstallPreparationUIProps {
  projectPath?: string;
  startTaskId?: InstallTaskId;
  chatMessages?: ChatMessageListMessage[];
  onRunProjectBuild: (context: PreparationContext) => Promise<ProjectBuildTaskResult>;
  onRunInstallSkill: (context: PreparationContext) => Promise<ProjectBuildTaskResult>;
  onComplete: (context: PreparationContext) => void;
  onCancel: () => void;
}

export interface ProjectBuildTaskResult {
  success: boolean;
  aborted?: boolean;
  error?: string;
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
  xcodeprojPath: string;
  projectId: string;
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
  authUrl: string | null;
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
  xcodeResult: PbxprojModificationResult | null;
  podfileResult: PodfileModificationResult | null;
  verificationChecks: NotificationExtensionVerificationChecks | null;
  warnings: string[];
  error: string | null;
}

interface StartTaskOverrideValidationInput {
  context: PreparationContext;
  effectiveStartTaskId: InstallTaskId | null;
  invalidEnvStartTask: string | null;
  taskOverrideEnabled: boolean;
}

interface StartTaskOverrideValidationResult {
  taskId: InstallTaskId | null;
  note: string | null;
}

async function buildNotificationExtensionContext(
  projectPath: string,
  iosBundleId: string | undefined,
  iosAppGroupId: string | undefined,
  firebaseProjectId: string | undefined,
  cachedContext: IosGuidedContextCache | null,
): Promise<NotificationExtensionSetupContext> {
  if (cachedContext?.projectId) {
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
  const projectId = firebaseProjectId || '';
  if (!projectId) {
    throw new Error('Firebase project ID is required for Notification Service Extension setup.');
  }

  return {
    bundleId,
    appGroupId,
    appName: analysis.project.appName,
    iosDir,
    xcodeprojPath: analysis.project.projectPath,
    projectId,
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
  runtimeTaskState: RuntimeTaskStateMap,
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
    case 'project_build':
    case 'install_skill':
      if (!context.ready) {
        return 'pending setup';
      }
      if (getTaskRuntimeState(taskId, runtimeTaskState) === 'running') {
        return 'running';
      }
      if (getTaskRuntimeState(taskId, runtimeTaskState) === 'complete') {
        return 'completed';
      }
      if (getTaskRuntimeState(taskId, runtimeTaskState) === 'failed') {
        return 'failed';
      }
      return 'not run';
    default:
      return undefined;
  }
}

function getStatusRows(
  context: PreparationContext,
  layoutPolicy: StatusLayoutPolicy,
  runtimeTaskState: RuntimeTaskStateMap,
): StatusRow[] {
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

  const taskRows: StatusRow[] = getApplicableInstallTasks(context).map((taskId) => {
    const status: StatusLineState =
      isRuntimeTask(taskId) && getTaskRuntimeState(taskId, runtimeTaskState) === 'running'
        ? 'checking'
        : isTaskCompleted(context, taskId, runtimeTaskState)
          ? 'ok'
          : 'missing';

    return {
      label: INSTALL_TASK_LABELS[taskId],
      status,
      detail: getTaskDetail(context, taskId, layoutPolicy.showDetailText, runtimeTaskState),
    };
  });

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
  runtimeTaskState,
  note,
  onContinue,
  onCancel,
}: {
  context: PreparationContext;
  runtimeTaskState: RuntimeTaskStateMap;
  note: string | null;
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const layoutPolicy = getStatusLayoutPolicy();
  const statusRows = getStatusRows(context, layoutPolicy, runtimeTaskState);
  const nextTaskId = getNextIncompleteTaskId(context, runtimeTaskState);
  const showMissingSummary =
    layoutPolicy.missingDisplayMode === 'summary' && context.missing.length > 0;
  const showMissingList = layoutPolicy.missingDisplayMode === 'full' && context.missing.length > 0;
  const primaryActionLabel =
    nextTaskId === null
      ? 'Finish install'
      : nextTaskId === 'project_build'
        ? 'Continue to build'
        : nextTaskId === 'install_skill'
          ? 'Continue to SDK installation'
          : 'Continue required setup';

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

function getProjectBuildMessages(
  chatMessages: ChatMessageListMessage[] | undefined,
  startIndex: number,
): ChatMessageListMessage[] {
  if (!chatMessages || chatMessages.length <= startIndex) {
    return [];
  }
  return chatMessages.slice(startIndex);
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
    case 'project_build':
      return 'project_build_running';
    case 'install_skill':
      return 'install_skill_running';
    default:
      return 'firebase_config_detecting';
  }
}

function createInitialFirebaseConfigState(): FirebaseConfigState {
  return {
    detection: null,
    projectType: null,
    service: null,
    authUrl: null,
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
    xcodeResult: null,
    podfileResult: null,
    verificationChecks: null,
    warnings: [],
    error: null,
  };
}

function collectNseVerificationChecks(
  nseContext: NotificationExtensionSetupContext,
): NotificationExtensionVerificationChecks {
  const extensionName = getExtensionName(nseContext.appName);
  const fileVerification = verifyExtensionFiles(nseContext.iosDir, nseContext.appName);
  const xcodeTargetConfigured = hasNotificationServiceExtension(
    nseContext.xcodeprojPath,
    extensionName,
  );
  const xcodeStatus = getNotificationServiceExtensionStatus(
    nseContext.xcodeprojPath,
    extensionName,
  );
  const buildSettingsConfigured =
    xcodeStatus.buildSettings.enableUserScriptSandboxingNo &&
    xcodeStatus.buildSettings.infoPlistConfigured &&
    xcodeStatus.buildSettings.codeSignEntitlementsConfigured;

  const podfileExists = hasPodfile(nseContext.iosDir);
  const podDependencyConfigured =
    !podfileExists ||
    (hasExtensionTarget(nseContext.iosDir, extensionName) &&
      hasClixPodInExtensionTarget(nseContext.iosDir, extensionName));

  const swiftStatus = inspectNotificationServiceSwift(nseContext.iosDir, nseContext.appName);
  const notificationServiceConfigured =
    swiftStatus.exists &&
    swiftStatus.importsClix &&
    swiftStatus.inheritsClixNse &&
    swiftStatus.hasRegisterCall &&
    swiftStatus.hasSuperDidReceive &&
    swiftStatus.registeredProjectId === nseContext.projectId;

  const missingReasons: string[] = [];
  if (!fileVerification.complete) {
    missingReasons.push(`Missing NSE files: ${fileVerification.missingFiles.join(', ')}`);
  }
  if (!xcodeTargetConfigured) {
    missingReasons.push('Xcode Notification Service Extension target is missing');
  }
  if (!buildSettingsConfigured) {
    missingReasons.push('NSE build settings are incomplete');
  }
  if (!podDependencyConfigured) {
    missingReasons.push('Clix dependency is not configured in Podfile extension target');
  }
  if (!notificationServiceConfigured) {
    missingReasons.push('NotificationService.swift is not fully configured for Clix');
  }

  return {
    filesComplete: fileVerification.complete,
    xcodeTargetConfigured,
    buildSettingsConfigured,
    podDependencyConfigured,
    notificationServiceConfigured,
    missingReasons,
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

function validateStartTaskOverride({
  context,
  effectiveStartTaskId,
  invalidEnvStartTask,
  taskOverrideEnabled,
}: StartTaskOverrideValidationInput): StartTaskOverrideValidationResult {
  if (!effectiveStartTaskId) {
    if (invalidEnvStartTask) {
      return {
        taskId: null,
        note: `Ignoring ${START_TASK_ENV_NAME}="${invalidEnvStartTask}" because it is not a valid install task id.`,
      };
    }
    return { taskId: null, note: null };
  }

  if (!taskOverrideEnabled) {
    return {
      taskId: null,
      note: `Task override was requested but disabled. Set ${TASK_OVERRIDE_ENV_NAME}=1 to enable it.`,
    };
  }

  const applicableTasks = getApplicableInstallTasks(context);
  if (!applicableTasks.includes(effectiveStartTaskId)) {
    return {
      taskId: null,
      note: `Task override "${effectiveStartTaskId}" is not applicable for this project (${formatProjectType(context.projectType)}).`,
    };
  }

  if (effectiveStartTaskId === 'project_build' && !context.ready) {
    return {
      taskId: null,
      note: 'Task override "project_build" requires all setup tasks to be completed first.',
    };
  }

  if (effectiveStartTaskId === 'install_skill' && !context.ready) {
    return {
      taskId: null,
      note: 'Task override "install_skill" requires all setup tasks to be completed first.',
    };
  }

  if (effectiveStartTaskId === 'notification_service_extension' && !context.firebase.projectId) {
    return {
      taskId: null,
      note: 'Task override requires a detected Firebase project ID. Configure Firebase Configuration Files first.',
    };
  }

  if (effectiveStartTaskId === 'notification_service_extension' && !context.ios.bundleId) {
    return {
      taskId: null,
      note: 'Task override requires a detected iOS bundle ID.',
    };
  }

  return { taskId: effectiveStartTaskId, note: null };
}

/**
 * Install preparation UI component.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Central orchestration for install preparation leaf tasks.
export function InstallPreparationUI({
  projectPath = process.cwd(),
  startTaskId,
  chatMessages,
  onRunProjectBuild,
  onRunInstallSkill,
  onComplete,
  onCancel,
}: InstallPreparationUIProps): React.ReactElement {
  const taskOverrideEnabled = process.env[TASK_OVERRIDE_ENV_NAME] === '1';
  const envStartTaskRaw = process.env[START_TASK_ENV_NAME];
  const envStartTaskId =
    envStartTaskRaw && INSTALL_TASK_IDS.includes(envStartTaskRaw as InstallTaskId)
      ? (envStartTaskRaw as InstallTaskId)
      : null;
  const invalidEnvStartTask = envStartTaskRaw && !envStartTaskId ? envStartTaskRaw : null;
  const effectiveStartTaskId = startTaskId ?? envStartTaskId;
  const startTaskOverrideHandledRef = useRef(false);
  const nseCompletionHandledRef = useRef(false);
  const projectBuildCompletionHandledRef = useRef(false);
  const projectBuildRunStartedRef = useRef(false);
  const installSkillCompletionHandledRef = useRef(false);
  const installSkillRunStartedRef = useRef(false);

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
  const [runtimeTaskState, setRuntimeTaskState] = useState<RuntimeTaskStateMap>({});
  const [buildTaskError, setBuildTaskError] = useState<string | null>(null);
  const [installSkillError, setInstallSkillError] = useState<string | null>(null);
  const [projectBuildMessageStartIndex, setProjectBuildMessageStartIndex] = useState<number>(0);
  const [installSkillMessageStartIndex, setInstallSkillMessageStartIndex] = useState<number>(0);
  const chatMessageCountRef = useRef(chatMessages?.length ?? 0);

  useEffect(() => {
    chatMessageCountRef.current = chatMessages?.length ?? 0;
  }, [chatMessages?.length]);

  const [firebaseConfigDownloader] = useState(() => new FirebaseDownloader());
  const [serviceAccountDownloader] = useState(() => new FirebaseDownloader());

  const cancelFirebaseAuthentication = useCallback(
    (reason = 'Install preparation cancelled') => {
      firebaseConfigDownloader.cancelAuthentication(reason);
      serviceAccountDownloader.cancelAuthentication(reason);
    },
    [firebaseConfigDownloader, serviceAccountDownloader],
  );

  useEffect(() => {
    return () => {
      cancelFirebaseAuthentication('Install preparation closed');
    };
  }, [cancelFirebaseAuthentication]);

  const resetTaskRuntimeState = useCallback((preparationContext?: PreparationContext) => {
    setActiveLeafTaskId(null);
    setFirebaseConfigState(createInitialFirebaseConfigState());
    setFirebaseServiceAccountState(createInitialFirebaseServiceAccountState());
    setNotificationExtensionState(createInitialNotificationExtensionState());
    setApnsState(preparationContext ? createInitialApnsState(preparationContext) : null);
  }, []);

  const beginTask = useCallback(
    (taskId: InstallTaskId, preparationContext: PreparationContext) => {
      setNote(null);
      nseCompletionHandledRef.current = false;
      projectBuildCompletionHandledRef.current = false;
      installSkillCompletionHandledRef.current = false;
      if (isRuntimeTask(taskId)) {
        setRuntimeTaskState((prev) => ({ ...prev, [taskId]: 'running' }));
      }
      if (taskId === 'project_build') {
        projectBuildRunStartedRef.current = false;
        setBuildTaskError(null);
        setProjectBuildMessageStartIndex(chatMessageCountRef.current);
      }
      if (taskId === 'install_skill') {
        installSkillRunStartedRef.current = false;
        setInstallSkillError(null);
        setInstallSkillMessageStartIndex(chatMessageCountRef.current);
      }
      setActiveTaskId(taskId);
      resetTaskRuntimeState(preparationContext);
      setActiveLeafTaskId(getInitialLeafTaskId(taskId));
      setPhase('task');
    },
    [resetTaskRuntimeState],
  );

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
      if (startTaskOverrideHandledRef.current) {
        setPhase('status');
        return;
      }
      startTaskOverrideHandledRef.current = true;

      const overrideDecision = validateStartTaskOverride({
        context: nextContext,
        effectiveStartTaskId,
        invalidEnvStartTask,
        taskOverrideEnabled,
      });
      if (!overrideDecision.taskId) {
        if (overrideDecision.note) {
          setNote(overrideDecision.note);
        }
        setPhase('status');
        return;
      }

      beginTask(overrideDecision.taskId, nextContext);
    };

    void check();

    return () => {
      mounted = false;
    };
  }, [beginTask, effectiveStartTaskId, invalidEnvStartTask, projectPath, taskOverrideEnabled]);

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
      cancelFirebaseAuthentication('Setup step cancelled');
      if (activeTaskId && isRuntimeTask(activeTaskId)) {
        setRuntimeTaskState((prev) => ({ ...prev, [activeTaskId]: 'failed' }));
      }
      setActiveTaskId(null);
      resetTaskRuntimeState(context ?? undefined);
      setNote(nextNote ?? 'Setup step was not completed. Continue required setup to proceed.');
      setPhase('status');
    },
    [activeTaskId, cancelFirebaseAuthentication, context, resetTaskRuntimeState],
  );

  const handleContinue = useCallback(() => {
    if (!context) {
      return;
    }

    const nextTaskId = getNextIncompleteTaskId(context, runtimeTaskState);
    if (!nextTaskId) {
      onComplete(context);
      return;
    }

    setNote(null);
    beginTask(nextTaskId, context);
  }, [beginTask, context, onComplete, runtimeTaskState]);

  const handleCancelPreparation = useCallback(() => {
    cancelFirebaseAuthentication('Install preparation cancelled');
    onCancel();
  }, [cancelFirebaseAuthentication, onCancel]);

  useCancelInput(handleCancelPreparation, {
    isActive:
      phase === 'task' &&
      ((activeTaskId === 'project_build' && activeLeafTaskId === 'project_build_running') ||
        (activeTaskId === 'install_skill' && activeLeafTaskId === 'install_skill_running')),
  });

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
        setFirebaseConfigState((prev) => ({ ...prev, authUrl: null }));

        if (!isOAuthConfigured()) {
          throw new Error('Google OAuth is not configured. Set Firebase OAuth credentials first.');
        }

        const isAuthenticated = await firebaseConfigDownloader.isAuthenticated();
        if (!isAuthenticated) {
          const authResult = await firebaseConfigDownloader.authenticate((url) => {
            if (cancelled) {
              return;
            }
            setFirebaseConfigState((prev) => ({ ...prev, authUrl: url }));
            void openBrowser(url);
          });
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
      firebaseConfigDownloader.cancelAuthentication(
        'Firebase configuration authentication cancelled',
      );
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
          context?.firebase.projectId,
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
    context?.firebase.projectId,
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
        projectId: nseContext.projectId,
      };

      const result = await createExtensionFiles(extensionContext);
      if (cancelled) {
        return;
      }

      setNotificationExtensionState((prev) => ({
        ...prev,
        extensionResult: result,
        warnings: result.warnings,
      }));
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

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_xcode_target'
    ) {
      return;
    }

    const nseContext = notificationExtensionState.context;
    if (!nseContext || notificationExtensionState.xcodeResult) {
      return;
    }

    let cancelled = false;

    const applyXcodeSetup = async () => {
      try {
        const extensionName = getExtensionName(nseContext.appName);
        const extensionBundleId = getExtensionBundleId(nseContext.bundleId, nseContext.appName);
        const extensionDir = path.join(nseContext.iosDir, extensionName);

        const swiftPatch = ensureNotificationServiceSwiftProjectId(
          nseContext.iosDir,
          nseContext.appName,
          nseContext.projectId,
        );

        const xcodeResult = await addNotificationServiceExtension({
          projectPath: nseContext.xcodeprojPath,
          extensionName,
          extensionBundleId,
          extensionDir,
          appGroupId: nseContext.appGroupId,
          teamId: context?.ios.teamId,
        });

        if (cancelled) {
          return;
        }

        setNotificationExtensionState((prev) => ({
          ...prev,
          xcodeResult,
          warnings: [...prev.warnings, ...swiftPatch.warnings, ...xcodeResult.warnings],
        }));

        if (!xcodeResult.success) {
          setNotificationExtensionState((prev) => ({
            ...prev,
            error: xcodeResult.error || 'Failed to apply NSE Xcode target setup',
          }));
          setActiveLeafTaskId('nse_complete');
          return;
        }

        setActiveLeafTaskId('nse_build_settings');
      } catch (err) {
        if (cancelled) {
          return;
        }
        setNotificationExtensionState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to configure NSE target',
        }));
        setActiveLeafTaskId('nse_complete');
      }
    };

    void applyXcodeSetup();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    context?.ios.teamId,
    notificationExtensionState.context,
    notificationExtensionState.xcodeResult,
    phase,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_build_settings'
    ) {
      return;
    }

    setActiveLeafTaskId('nse_dependencies');
  }, [activeLeafTaskId, activeTaskId, phase]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_dependencies'
    ) {
      return;
    }

    const nseContext = notificationExtensionState.context;
    if (!nseContext || notificationExtensionState.podfileResult) {
      return;
    }

    let cancelled = false;

    const applyDependencySetup = async () => {
      const extensionName = getExtensionName(nseContext.appName);
      const podfileResult = await addClixToExtensionTarget({
        iosDir: nseContext.iosDir,
        extensionName,
      });

      if (cancelled) {
        return;
      }

      setNotificationExtensionState((prev) => ({
        ...prev,
        podfileResult,
        warnings: [
          ...prev.warnings,
          ...(podfileResult.podfileExists
            ? []
            : [
                'Podfile not found. Configure Clix dependency manually (SPM or custom build setup).',
              ]),
        ],
      }));
      setActiveLeafTaskId('nse_verification');
    };

    void applyDependencySetup();

    return () => {
      cancelled = true;
    };
  }, [
    activeLeafTaskId,
    activeTaskId,
    notificationExtensionState.context,
    notificationExtensionState.podfileResult,
    phase,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_verification'
    ) {
      return;
    }

    const nseContext = notificationExtensionState.context;
    if (!nseContext) {
      return;
    }

    const checks = collectNseVerificationChecks(nseContext);
    setNotificationExtensionState((prev) => ({ ...prev, verificationChecks: checks }));
    setActiveLeafTaskId('nse_complete');
  }, [activeLeafTaskId, activeTaskId, notificationExtensionState.context, phase]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'notification_service_extension' ||
      activeLeafTaskId !== 'nse_complete'
    ) {
      return;
    }

    if (nseCompletionHandledRef.current) {
      return;
    }
    nseCompletionHandledRef.current = true;

    if (notificationExtensionState.error) {
      handleTaskBackToStatus(notificationExtensionState.error);
      return;
    }

    const nseContext = notificationExtensionState.context;
    if (!nseContext) {
      handleTaskBackToStatus('Notification extension context is missing.');
      return;
    }
    if (!context) {
      handleTaskBackToStatus('Install preparation context is missing.');
      return;
    }

    const checks =
      notificationExtensionState.verificationChecks ?? collectNseVerificationChecks(nseContext);
    if (checks.missingReasons.length > 0) {
      handleTaskBackToStatus(
        `Notification Service Extension setup is incomplete: ${checks.missingReasons[0]}`,
      );
      return;
    }

    void applyTaskCompletion({
      ios: {
        needed: context.ios.needed,
        nseConfigured: true,
      },
    });
  }, [
    activeLeafTaskId,
    activeTaskId,
    applyTaskCompletion,
    context,
    handleTaskBackToStatus,
    notificationExtensionState.context,
    notificationExtensionState.error,
    notificationExtensionState.verificationChecks,
    phase,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'project_build' ||
      activeLeafTaskId !== 'project_build_running'
    ) {
      return;
    }

    if (!context) {
      handleTaskBackToStatus('Install preparation context is missing.');
      return;
    }
    if (projectBuildRunStartedRef.current) {
      return;
    }
    projectBuildRunStartedRef.current = true;

    let cancelled = false;

    const runProjectBuild = async () => {
      setRuntimeTaskState((prev) => ({ ...prev, project_build: 'running' }));
      setBuildTaskError(null);

      const result = await onRunProjectBuild(context);
      if (cancelled) {
        return;
      }

      if (result.success) {
        setRuntimeTaskState((prev) => ({ ...prev, project_build: 'complete' }));
        setActiveLeafTaskId('project_build_succeeded');
        return;
      }

      const errorMessage =
        result.error ??
        (result.aborted ? 'Project build was interrupted.' : 'Project build failed.');
      setRuntimeTaskState((prev) => ({ ...prev, project_build: 'failed' }));
      setBuildTaskError(errorMessage);
      setActiveLeafTaskId('project_build_failed');
    };

    void runProjectBuild();

    return () => {
      cancelled = true;
    };
  }, [activeLeafTaskId, activeTaskId, context, handleTaskBackToStatus, onRunProjectBuild, phase]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'project_build' ||
      activeLeafTaskId !== 'project_build_succeeded'
    ) {
      return;
    }

    if (projectBuildCompletionHandledRef.current) {
      return;
    }
    projectBuildCompletionHandledRef.current = true;

    if (!context) {
      handleTaskBackToStatus('Install preparation context is missing.');
      return;
    }

    setActiveTaskId(null);
    resetTaskRuntimeState(context);
    setNote('Project build completed. Continue to SDK installation.');
    setPhase('status');
  }, [
    activeLeafTaskId,
    activeTaskId,
    context,
    handleTaskBackToStatus,
    phase,
    resetTaskRuntimeState,
  ]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'install_skill' ||
      activeLeafTaskId !== 'install_skill_running'
    ) {
      return;
    }

    if (!context) {
      handleTaskBackToStatus('Install preparation context is missing.');
      return;
    }
    if (installSkillRunStartedRef.current) {
      return;
    }
    installSkillRunStartedRef.current = true;

    let cancelled = false;

    const runInstallSkill = async () => {
      setRuntimeTaskState((prev) => ({ ...prev, install_skill: 'running' }));
      setInstallSkillError(null);

      const result = await onRunInstallSkill(context);
      if (cancelled) {
        return;
      }

      if (result.success) {
        setRuntimeTaskState((prev) => ({ ...prev, install_skill: 'complete' }));
        setActiveLeafTaskId('install_skill_succeeded');
        return;
      }

      const errorMessage =
        result.error ??
        (result.aborted ? 'SDK installation was interrupted.' : 'SDK installation failed.');
      setRuntimeTaskState((prev) => ({ ...prev, install_skill: 'failed' }));
      setInstallSkillError(errorMessage);
      setActiveLeafTaskId('install_skill_failed');
    };

    void runInstallSkill();

    return () => {
      cancelled = true;
    };
  }, [activeLeafTaskId, activeTaskId, context, handleTaskBackToStatus, onRunInstallSkill, phase]);

  useEffect(() => {
    if (
      phase !== 'task' ||
      activeTaskId !== 'install_skill' ||
      activeLeafTaskId !== 'install_skill_succeeded'
    ) {
      return;
    }

    if (installSkillCompletionHandledRef.current) {
      return;
    }
    installSkillCompletionHandledRef.current = true;

    if (!context) {
      handleTaskBackToStatus('Install preparation context is missing.');
      return;
    }

    setActiveTaskId(null);
    resetTaskRuntimeState(context);
    setNote('SDK installation completed. Select "Finish install" to close /install.');
    setPhase('status');
  }, [
    activeLeafTaskId,
    activeTaskId,
    context,
    handleTaskBackToStatus,
    phase,
    resetTaskRuntimeState,
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
        runtimeTaskState={runtimeTaskState}
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
            <FirebaseConfigAuthenticatingTask
              authUrl={firebaseConfigState.authUrl}
              onCancel={() => handleTaskBackToStatus()}
            />
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
                  xcodeprojPath: result.agentContext.projectPath,
                  projectId: context.firebase.projectId || '',
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
            <NotificationExtensionXcodeTask
              extensionName={extensionName}
              extensionBundleId={extensionBundleId}
              extensionResult={extensionResult}
              appGroupId={nseContext.appGroupId}
              xcodeResult={notificationExtensionState.xcodeResult}
            />
          )}

          {activeLeafTaskId === 'nse_build_settings' && nseContext && (
            <NotificationExtensionBuildSettingsTask
              extensionName={extensionName}
              entitlementsPath={nseContext.entitlementsPath}
            />
          )}

          {activeLeafTaskId === 'nse_dependencies' && (
            <NotificationExtensionDependenciesTask
              extensionName={extensionName}
              podfileResult={notificationExtensionState.podfileResult}
            />
          )}

          {activeLeafTaskId === 'nse_verification' && nseContext && (
            <NotificationExtensionVerificationTask
              context={nseContext}
              extensionResult={extensionResult}
              checks={notificationExtensionState.verificationChecks}
            />
          )}

          {activeLeafTaskId === 'nse_complete' && (
            <NotificationExtensionCompleteTask
              error={notificationExtensionState.error}
              extensionResult={extensionResult}
              warnings={notificationExtensionState.warnings}
            />
          )}
        </Box>
      );
    }

    case 'project_build': {
      const failedItems: ActionItem[] = [
        { id: 'retry', label: 'Retry build', action: 'continue' },
        { id: 'cancel', label: 'Cancel', action: 'cancel' },
      ];
      const projectBuildMessages = getProjectBuildMessages(
        chatMessages,
        projectBuildMessageStartIndex,
      );
      const waitingOutput = (
        <Box marginTop={1}>
          <Text color="gray">Waiting for agent output...</Text>
        </Box>
      );

      return (
        <Box flexDirection="column">
          <TaskHeader
            title="Project Build"
            subtitle="Run the final project build task before finishing /install."
          />

          {activeLeafTaskId === 'project_build_running' && (
            <Box flexDirection="column" marginY={1}>
              <Box>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text> Running project-build agent task...</Text>
              </Box>
              <ChatMessageList
                messages={projectBuildMessages}
                maxHeight={12}
                emptyState={waitingOutput}
              />
            </Box>
          )}

          {activeLeafTaskId === 'project_build_succeeded' && (
            <Box flexDirection="column" marginY={1}>
              <Text color="green">✓ Project build completed.</Text>
              <Text color="gray">Returning to install checklist...</Text>
            </Box>
          )}

          {activeLeafTaskId === 'project_build_failed' && (
            <Box flexDirection="column" marginY={1}>
              <Text color="red">✗ {buildTaskError || 'Project build failed.'}</Text>
              <ChatMessageList
                messages={projectBuildMessages}
                maxHeight={12}
                emptyState={waitingOutput}
              />
              <Box marginTop={1}>
                <GenericSelector
                  items={failedItems}
                  title=""
                  onSelect={(item) => {
                    if (item.action === 'cancel') {
                      handleTaskBackToStatus(
                        'Project build was not completed. Continue to build to finish /install.',
                      );
                      return;
                    }
                    setBuildTaskError(null);
                    setActiveLeafTaskId('project_build_running');
                  }}
                  onCancel={() =>
                    handleTaskBackToStatus(
                      'Project build was not completed. Continue to build to finish /install.',
                    )
                  }
                />
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    case 'install_skill': {
      const failedItems: ActionItem[] = [
        { id: 'retry', label: 'Retry SDK installation', action: 'continue' },
        { id: 'cancel', label: 'Cancel', action: 'cancel' },
      ];
      const installSkillMessages = getProjectBuildMessages(
        chatMessages,
        installSkillMessageStartIndex,
      );
      const waitingOutput = (
        <Box marginTop={1}>
          <Text color="gray">Waiting for agent output...</Text>
        </Box>
      );

      return (
        <Box flexDirection="column">
          <TaskHeader
            title="SDK Installation"
            subtitle="Run install skill to apply SDK code integration."
          />

          {activeLeafTaskId === 'install_skill_running' && (
            <Box flexDirection="column" marginY={1}>
              <Box>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text> Running install skill task...</Text>
              </Box>
              <ChatMessageList
                messages={installSkillMessages}
                maxHeight={12}
                emptyState={waitingOutput}
              />
            </Box>
          )}

          {activeLeafTaskId === 'install_skill_succeeded' && (
            <Box flexDirection="column" marginY={1}>
              <Text color="green">✓ SDK installation completed.</Text>
              <Text color="gray">Returning to install checklist...</Text>
            </Box>
          )}

          {activeLeafTaskId === 'install_skill_failed' && (
            <Box flexDirection="column" marginY={1}>
              <Text color="red">✗ {installSkillError || 'SDK installation failed.'}</Text>
              <ChatMessageList
                messages={installSkillMessages}
                maxHeight={12}
                emptyState={waitingOutput}
              />
              <Box marginTop={1}>
                <GenericSelector
                  items={failedItems}
                  title=""
                  onSelect={(item) => {
                    if (item.action === 'cancel') {
                      handleTaskBackToStatus(
                        'SDK installation was not completed. Continue to SDK installation to finish /install.',
                      );
                      return;
                    }
                    setInstallSkillError(null);
                    setActiveLeafTaskId('install_skill_running');
                  }}
                  onCancel={() =>
                    handleTaskBackToStatus(
                      'SDK installation was not completed. Continue to SDK installation to finish /install.',
                    )
                  }
                />
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    default:
      return (
        <StatusPhase
          context={context}
          runtimeTaskState={runtimeTaskState}
          note={note}
          onContinue={handleContinue}
          onCancel={handleCancelPreparation}
        />
      );
  }
}
