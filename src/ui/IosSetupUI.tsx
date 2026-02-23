import { createInterface } from 'node:readline';
import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  type AgentContext,
  analyzeIosProject,
  buildAgentContext,
  type CapabilitySyncResult,
  ensureMainTargetEntitlementsLink,
  generateAppGroupId,
  getAppleApiErrorMessage,
  getEntitlementsPath,
  getIosProjectDir,
  type IosProjectInfo,
  type MainTargetEntitlementsLinkResult,
  readEntitlements,
  syncCapabilities,
  updateEntitlementsForClix,
} from '@/lib/ios';
import { getRequestContext, loginWithUserCredentialsAsync } from '@/lib/ios/apple-auth';
import { FirebaseService } from '@/lib/services/firebase';
import type { GoogleServiceInfoPlist, GoogleServicesJson } from '@/lib/services/firebase/types';
import { detectProjectType } from '@/lib/services/project-detector';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';
import { useCancelInput } from '@/ui/hooks';

type SetupPhase =
  | 'analyzing'
  | 'authenticating'
  | 'syncing'
  | 'updating_entitlements'
  | 'complete'
  | 'error';

export interface IosSetupOptions {
  /** Bundle ID (override auto-detection) */
  bundleId?: string;
  /** Push notification environment */
  pushEnvironment?: 'development' | 'production';
}

export interface IosSetupResult {
  success: boolean;
  projectInfo?: IosProjectInfo;
  portalSync?: CapabilitySyncResult;
  entitlementsUpdated: string[];
  error?: string;
  /** Context for agent to complete remaining tasks */
  agentContext?: AgentContext;
  /** Bundle ID for push setup integration */
  bundleId?: string;
  /** Firebase Project ID for push setup integration */
  firebaseProjectId?: string | null;
  /** Apple Team ID for push setup integration (from GoogleService-Info.plist) */
  teamId?: string | null;
  /** Structured summary for idempotent install flow */
  changeSummary?: {
    changedFiles: string[];
    skippedChecks: string[];
    warnings: string[];
  };
  /** Main app target CODE_SIGN_ENTITLEMENTS linkage result */
  mainTargetEntitlementsLink?: MainTargetEntitlementsLinkResult;
}

interface IosSetupUIProps {
  options: IosSetupOptions;
  onComplete?: (result: IosSetupResult) => void;
}

interface SetupState {
  phase: SetupPhase;
  projectInfo: IosProjectInfo | null;
  portalResult: CapabilitySyncResult | null;
  portalSkipped: boolean;
  portalSkipReason: string | null;
  authStatusMessage: string;
  mainTargetEntitlementsLink: MainTargetEntitlementsLinkResult | null;
  updatedFiles: string[];
  errorMessage: string;
}

function promptTerminalInput(message: string, defaultValue?: string): Promise<string> {
  const stdin = process.stdin;
  const canToggleRawMode = typeof stdin.isTTY === 'boolean' && stdin.isTTY && 'setRawMode' in stdin;
  const wasRawModeEnabled =
    canToggleRawMode && typeof stdin.isRaw === 'boolean' ? stdin.isRaw : false;

  if (canToggleRawMode && wasRawModeEnabled) {
    (stdin as NodeJS.ReadStream).setRawMode(false);
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${message} [${defaultValue}] ` : `${message} `;
    rl.question(prompt, (answer) => {
      rl.close();
      if (canToggleRawMode && wasRawModeEnabled) {
        (stdin as NodeJS.ReadStream).setRawMode(true);
      }
      resolve(answer || defaultValue || '');
    });
  });
}

function promptTerminalConfirm(message: string): Promise<boolean> {
  return promptTerminalInput(`${message} (y/N)`).then(
    (answer) => answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
  );
}

/**
 * Sync capabilities with Apple Developer Portal via Apple ID login.
 * If the user cancels login, returns null and portal sync is skipped.
 */
async function syncWithPortal(
  bundleId: string,
  appGroupId: string,
  setPhase: (phase: SetupPhase) => void,
  setAuthStatusMessage: (message: string) => void,
  setPortalSkipReason: (message: string | null) => void,
): Promise<CapabilitySyncResult | null> {
  const isBundleIdMismatchReason = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('not available') &&
      (normalized.includes('identifier') || normalized.includes('bundle id')) &&
      normalized.includes('apple team')
    );
  };

  setPhase('authenticating');
  setPortalSkipReason(null);
  setAuthStatusMessage('Waiting for Apple ID/password input in terminal prompt...');
  try {
    const userAuth = await loginWithUserCredentialsAsync(
      promptTerminalInput,
      promptTerminalInput,
      promptTerminalConfirm,
    );
    const context = getRequestContext(userAuth);

    setPhase('syncing');
    setAuthStatusMessage('Authenticated. Syncing Apple capabilities...');
    return await syncCapabilities(context, bundleId, appGroupId);
  } catch (error) {
    const reason =
      error instanceof Error ? getAppleApiErrorMessage(error) : 'Authentication was not completed';
    if (isBundleIdMismatchReason(reason)) {
      throw new Error(reason);
    }
    setPortalSkipReason(reason);
    setAuthStatusMessage(`Portal sync skipped: ${reason}`);
    // Portal sync is best-effort: login cancelled, auth failed, or API error
    // all result in skipping portal sync and continuing with entitlements.
    return null;
  }
}

interface EntitlementsUpdateResult {
  files: string[];
  entitlementsPath: string;
  iosDir: string;
}

/**
 * Update local entitlements files
 */
async function updateEntitlements(
  project: IosProjectInfo,
  bundleId: string,
  options: IosSetupOptions,
): Promise<EntitlementsUpdateResult | null> {
  const iosDir = getIosProjectDir(process.cwd());
  if (!iosDir || project.targets.length === 0) {
    return null;
  }

  const files: string[] = [];
  const mainTarget = project.targets[0];
  const entitlementsPath = getEntitlementsPath(iosDir, mainTarget);

  const existing =
    project.entitlementsFiles.length > 0
      ? await readEntitlements(project.entitlementsFiles[0])
      : null;

  await updateEntitlementsForClix(entitlementsPath, bundleId, {
    pushEnvironment: options.pushEnvironment || 'development',
    existingEntitlements: existing,
  });

  files.push(entitlementsPath);
  return { files, entitlementsPath, iosDir };
}

/**
 * Run the iOS setup process
 */
async function runSetup(
  options: IosSetupOptions,
  setState: React.Dispatch<React.SetStateAction<SetupState>>,
): Promise<IosSetupResult> {
  const result: IosSetupResult = {
    success: false,
    entitlementsUpdated: [],
    changeSummary: {
      changedFiles: [],
      skippedChecks: [],
      warnings: [],
    },
  };

  // Phase 1: Analyze iOS project
  setState((s) => ({ ...s, phase: 'analyzing' }));
  const analysisResult = await analyzeIosProject(process.cwd());

  if (!analysisResult.success || !analysisResult.project) {
    throw new Error(analysisResult.error || 'Failed to analyze iOS project');
  }

  const project = analysisResult.project;
  setState((s) => ({ ...s, projectInfo: project }));
  result.projectInfo = project;

  const bundleId = options.bundleId || project.bundleId;
  const appGroupId = generateAppGroupId(bundleId);

  // Phase 2: Sync with Apple Developer Portal via Apple ID login
  const syncResult = await syncWithPortal(
    bundleId,
    appGroupId,
    (phase) => setState((s) => ({ ...s, phase })),
    (message) => setState((s) => ({ ...s, authStatusMessage: message })),
    (message) => setState((s) => ({ ...s, portalSkipReason: message })),
  );
  if (syncResult) {
    setState((s) => ({ ...s, portalResult: syncResult }));
    result.portalSync = syncResult;
  } else {
    setState((s) => ({ ...s, portalSkipped: true }));
    result.changeSummary?.skippedChecks.push('Apple Developer Portal sync');
  }

  // Phase 3: Update local entitlements files
  setState((s) => ({ ...s, phase: 'updating_entitlements' }));
  const entitlementsResult = await updateEntitlements(project, bundleId, options);

  if (!entitlementsResult) {
    throw new Error(
      'Failed to update entitlements files. No iOS project directory or targets found.',
    );
  }

  const files = entitlementsResult.files;
  setState((s) => ({ ...s, updatedFiles: files }));
  result.entitlementsUpdated = files;
  result.changeSummary?.changedFiles.push(...files);

  // Phase 4: Ensure main app target links the entitlements file in build settings.
  const mainTargetLinkResult = await ensureMainTargetEntitlementsLink({
    projectPath: project.projectPath,
    entitlementsPath: entitlementsResult.entitlementsPath,
  });
  setState((s) => ({ ...s, mainTargetEntitlementsLink: mainTargetLinkResult }));
  result.mainTargetEntitlementsLink = mainTargetLinkResult;

  if (mainTargetLinkResult.success && !mainTargetLinkResult.alreadyConfigured) {
    const pbxprojPath = mainTargetLinkResult.projectFilePath;
    if (!result.changeSummary?.changedFiles.includes(pbxprojPath)) {
      result.changeSummary?.changedFiles.push(pbxprojPath);
    }
  }

  if (!mainTargetLinkResult.success) {
    const reason = mainTargetLinkResult.error || 'unknown reason';
    result.changeSummary?.warnings.push(`Failed to update Xcode entitlements linkage: ${reason}`);
  }

  // Build agent context for remaining tasks
  result.agentContext = buildAgentContext(
    project,
    bundleId,
    appGroupId,
    entitlementsResult.entitlementsPath,
    entitlementsResult.iosDir,
  );

  // Detect Firebase project ID and Team ID for push setup integration
  result.bundleId = bundleId;
  // Use Team ID from Xcode project settings (DEVELOPMENT_TEAM) if available
  result.teamId = project.teamId || null;
  try {
    const projectType = await detectProjectType(process.cwd());
    const firebaseService = new FirebaseService(process.cwd(), projectType);
    const firebaseDetection = await firebaseService.detect();
    const iosContent = firebaseDetection.ios?.content as GoogleServiceInfoPlist | undefined;
    const androidContent = firebaseDetection.android?.content as GoogleServicesJson | undefined;
    result.firebaseProjectId =
      iosContent?.PROJECT_ID || androidContent?.project_info?.project_id || null;
    // Override Team ID from Firebase config if available (more likely to be correct)
    if (iosContent?.TEAM_ID) {
      result.teamId = iosContent.TEAM_ID;
    }
  } catch {
    // Firebase detection is optional, don't fail if it errors
    result.firebaseProjectId = null;
    // Keep the teamId from project settings if Firebase detection fails
  }

  result.success = true;
  setState((s) => ({ ...s, phase: 'complete' }));
  return result;
}

export const IosSetupUI: React.FC<IosSetupUIProps> = ({ options, onComplete }) => {
  const { exit } = useApp();
  const [state, setState] = useState<SetupState>({
    phase: 'analyzing',
    projectInfo: null,
    portalResult: null,
    portalSkipped: false,
    portalSkipReason: null,
    authStatusMessage: '',
    mainTargetEntitlementsLink: null,
    updatedFiles: [],
    errorMessage: '',
  });
  const [result, setResult] = useState<IosSetupResult | null>(null);

  const {
    phase,
    projectInfo,
    portalResult,
    portalSkipped,
    portalSkipReason,
    authStatusMessage,
    mainTargetEntitlementsLink,
    updatedFiles,
    errorMessage,
  } = state;

  // Allow ESC/Ctrl+C to cancel during authenticating phase
  useCancelInput(() => exit(), { isActive: phase === 'authenticating' });

  // Handle user input for complete/error phases
  const handleContinue = useCallback(() => {
    if (phase === 'complete' && result) {
      onComplete?.(result);
      if (!onComplete) exit();
    } else if (phase === 'error') {
      onComplete?.({ success: false, entitlementsUpdated: [], error: errorMessage });
      if (!onComplete) exit();
    }
  }, [phase, result, errorMessage, onComplete, exit]);

  useInput((_input, key) => {
    if ((phase === 'complete' || phase === 'error') && key.return) {
      handleContinue();
    }
  });

  useEffect(() => {
    const execute = async () => {
      try {
        const setupResult = await runSetup(options, setState);
        setResult(setupResult);
      } catch (error) {
        const message = error instanceof Error ? getAppleApiErrorMessage(error) : String(error);
        setState((s) => ({ ...s, errorMessage: message, phase: 'error' }));
      }
    };

    execute();
  }, [options]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="iOS Setup" />

      {/* Phase: Analyzing */}
      {phase === 'analyzing' && <StatusMessage type="loading" message="Analyzing iOS project..." />}

      {/* Phase: Authenticating */}
      {phase === 'authenticating' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
          <StatusMessage type="loading" message="Logging in to Apple Developer account..." />
          {authStatusMessage ? (
            <Box marginLeft={2}>
              <Text dimColor>• {authStatusMessage}</Text>
            </Box>
          ) : null}
          <Box marginTop={1} marginLeft={2} flexDirection="column">
            <Text dimColor>• Press Ctrl+C to cancel</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Syncing */}
      {phase === 'syncing' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
          <StatusMessage type="success" message="Authenticated with Apple Developer Portal" />
          <StatusMessage type="loading" message="Syncing capabilities..." />
        </Box>
      )}

      {/* Phase: Updating Entitlements */}
      {phase === 'updating_entitlements' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
          <PortalSyncStatus
            portalResult={portalResult}
            portalSkipped={portalSkipped}
            portalSkipReason={portalSkipReason}
          />
          <StatusMessage type="loading" message="Updating entitlements files..." />
        </Box>
      )}

      {/* Phase: Complete */}
      {phase === 'complete' && (
        <CompletePhase
          projectInfo={projectInfo}
          portalResult={portalResult}
          portalSkipped={portalSkipped}
          portalSkipReason={portalSkipReason}
          mainTargetEntitlementsLink={mainTargetEntitlementsLink}
          updatedFiles={updatedFiles}
        />
      )}

      {/* Phase: Error */}
      {phase === 'error' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
          <StatusMessage type="error" message={errorMessage} />
          <Box marginTop={1}>
            <Text color="cyan">Press Enter to continue</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// Helper components to reduce complexity

const ProjectInfoStatus: React.FC<{ projectInfo: IosProjectInfo | null }> = ({ projectInfo }) => {
  if (!projectInfo) return null;
  return (
    <StatusMessage
      type="success"
      message={`Found project: ${projectInfo.appName} (${projectInfo.bundleId})`}
    />
  );
};

const PortalSyncStatus: React.FC<{
  portalResult: CapabilitySyncResult | null;
  portalSkipped: boolean;
  portalSkipReason: string | null;
}> = ({ portalResult, portalSkipped, portalSkipReason }) => {
  if (portalSkipped) {
    return (
      <Box flexDirection="column">
        <StatusMessage type="info" message="Portal sync skipped" />
        {portalSkipReason ? (
          <Box marginLeft={2}>
            <Text dimColor>Reason: {portalSkipReason}</Text>
          </Box>
        ) : null}
      </Box>
    );
  }
  if (!portalResult) return null;
  return (
    <Box flexDirection="column">
      <StatusMessage type="success" message="Apple Developer Portal sync complete" />
      {portalResult.enabled.length > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>Enabled: {portalResult.enabled.join(', ')}</Text>
        </Box>
      )}
      {portalResult.alreadyEnabled.length > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>Already enabled: {portalResult.alreadyEnabled.join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
};

const CompletePhase: React.FC<{
  projectInfo: IosProjectInfo | null;
  portalResult: CapabilitySyncResult | null;
  portalSkipped: boolean;
  portalSkipReason: string | null;
  mainTargetEntitlementsLink: MainTargetEntitlementsLinkResult | null;
  updatedFiles: string[];
}> = ({
  projectInfo,
  portalResult,
  portalSkipped,
  portalSkipReason,
  mainTargetEntitlementsLink,
  updatedFiles,
}) => {
  const nextSteps: string[] = [];

  if (mainTargetEntitlementsLink?.success) {
    nextSteps.push(
      'Xcode: Open ios/*.xcworkspace, select the main app target, and verify Push Notifications/App Groups in Signing & Capabilities.',
    );
    nextSteps.push('Xcode: Product -> Clean Build Folder, then Product -> Build.');
  } else {
    nextSteps.push('Xcode: Open ios/*.xcworkspace and select the main app target.');
    nextSteps.push(
      'Xcode: Build Settings -> set Code Signing Entitlements to the main app .entitlements file.',
    );
    nextSteps.push(
      'Xcode: Signing & Capabilities -> + Capability -> enable Push Notifications and App Groups.',
    );
    nextSteps.push(
      'Xcode: Product -> Clean Build Folder, then Product -> Build and resolve remaining signing/profile errors.',
    );
  }

  if (portalSkipped) {
    nextSteps.push(
      'If Xcode cannot enable capabilities (team/permission issue), use Apple Developer Portal: https://developer.apple.com/account/resources/identifiers/list -> Identifiers -> your App ID -> enable Push Notifications/App Groups -> Save.',
    );
  }

  nextSteps.push(
    'If signing/profile errors remain, open https://developer.apple.com/account/resources/profiles/list and regenerate profiles for this App ID (or let Automatic Signing refresh them).',
  );

  return (
    <Box flexDirection="column">
      <ProjectInfoStatus projectInfo={projectInfo} />

      {portalResult && (
        <Box flexDirection="column">
          <StatusMessage type="success" message="Apple Developer Portal sync complete" />
          {portalResult.enabled.length > 0 && (
            <Box marginLeft={2}>
              <Text dimColor>Enabled: {portalResult.enabled.join(', ')}</Text>
            </Box>
          )}
          {portalResult.appGroupCreated && portalResult.appGroupId && (
            <Box marginLeft={2}>
              <Text dimColor>Created App Group: {portalResult.appGroupId}</Text>
            </Box>
          )}
        </Box>
      )}

      {portalSkipped && (
        <Box flexDirection="column">
          <StatusMessage type="info" message="Portal sync skipped" />
          {portalSkipReason ? (
            <Box marginLeft={2}>
              <Text dimColor>Reason: {portalSkipReason}</Text>
            </Box>
          ) : null}
        </Box>
      )}

      <StatusMessage type="success" message="Entitlements files updated" />
      {updatedFiles.map((file) => (
        <Box key={file} marginLeft={2}>
          <Text dimColor>• {file}</Text>
        </Box>
      ))}

      {mainTargetEntitlementsLink?.success ? (
        <Box flexDirection="column">
          <StatusMessage
            type="success"
            message={
              mainTargetEntitlementsLink.alreadyConfigured
                ? 'Xcode entitlements linkage already configured'
                : 'Xcode entitlements linkage updated'
            }
          />
        </Box>
      ) : (
        <Box flexDirection="column">
          <StatusMessage
            type="warning"
            message="Could not automatically link entitlements in Xcode build settings"
          />
          {mainTargetEntitlementsLink?.error && (
            <Box marginLeft={2}>
              <Text color="yellow">Reason: {mainTargetEntitlementsLink.error}</Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text bold color="green">
          ✓ iOS setup completed successfully!
        </Text>
      </Box>

      {/* Next steps */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Next steps:</Text>
        <Box marginLeft={2} flexDirection="column">
          {nextSteps.map((step, index) => (
            <Text key={step}>
              {index + 1}. {step}
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="cyan">Press Enter to continue</Text>
      </Box>
    </Box>
  );
};
