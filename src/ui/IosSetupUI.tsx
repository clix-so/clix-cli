import { Auth } from '@expo/apple-utils';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  getRequestContext,
  loginWithUserCredentialsAsync,
  type UserAuthContext,
} from '@/lib/ios/apple-auth';
import { FirebaseService } from '@/lib/services/firebase';
import type { GoogleServiceInfoPlist, GoogleServicesJson } from '@/lib/services/firebase/types';
import { detectProjectType } from '@/lib/services/project-detector';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';
import { useCancelInput } from '@/ui/hooks';

type SetupPhase =
  | 'analyzing'
  | 'auth_apple_id_input'
  | 'auth_restoring_session'
  | 'auth_password_input'
  | 'auth_logging_in'
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
  /** Pre-authenticated Apple context from a previous step (e.g., APNS key acquisition). */
  appleAuthContext?: UserAuthContext;
  onComplete?: (result: IosSetupResult) => void;
}

interface AnalysisResult {
  project: IosProjectInfo;
  bundleId: string;
  appGroupId: string;
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
  appleId: string;
  password: string;
  authError: string | null;
  analysisResult: AnalysisResult | null;
}

interface EntitlementsUpdateResult {
  files: string[];
  entitlementsPath: string;
  iosDir: string;
}

function isBundleIdMismatchReason(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('not available') &&
    (normalized.includes('identifier') || normalized.includes('bundle id')) &&
    normalized.includes('apple team')
  );
}

/**
 * Run project analysis (Phase 1 of setup).
 */
async function runAnalysis(options: IosSetupOptions): Promise<AnalysisResult> {
  const analysisResult = await analyzeIosProject(process.cwd());

  if (!analysisResult.success || !analysisResult.project) {
    throw new Error(analysisResult.error || 'Failed to analyze iOS project');
  }

  const project = analysisResult.project;
  const bundleId = options.bundleId || project.bundleId;
  const appGroupId = generateAppGroupId(bundleId);

  return { project, bundleId, appGroupId };
}

/**
 * Sync capabilities with Apple Developer Portal using authenticated context.
 */
async function runPortalSync(
  authContext: UserAuthContext,
  bundleId: string,
  appGroupId: string,
): Promise<CapabilitySyncResult> {
  const context = getRequestContext(authContext);
  return await syncCapabilities(context, bundleId, appGroupId);
}

/**
 * Update local entitlements files.
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
 * Run post-auth setup: portal sync (optional) + entitlements + build settings.
 */
async function runPostAuth(
  analysis: AnalysisResult,
  portalSync: CapabilitySyncResult | null,
  portalSkipped: boolean,
  portalSkipReason: string | null,
  options: IosSetupOptions,
  setState: React.Dispatch<React.SetStateAction<SetupState>>,
): Promise<IosSetupResult> {
  const { project, bundleId, appGroupId } = analysis;

  const result: IosSetupResult = {
    success: false,
    entitlementsUpdated: [],
    changeSummary: {
      changedFiles: [],
      skippedChecks: [],
      warnings: [],
    },
    projectInfo: project,
  };

  if (portalSync) {
    setState((s) => ({ ...s, portalResult: portalSync }));
    result.portalSync = portalSync;
  } else if (portalSkipped) {
    setState((s) => ({ ...s, portalSkipped: true, portalSkipReason }));
    result.changeSummary?.skippedChecks.push('Apple Developer Portal sync');
  }

  // Update local entitlements files
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

  // Ensure main app target links the entitlements file in build settings.
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
  result.teamId = project.teamId || null;
  try {
    const projectType = await detectProjectType(process.cwd());
    const firebaseService = new FirebaseService(process.cwd(), projectType);
    const firebaseDetection = await firebaseService.detect();
    const iosContent = firebaseDetection.ios?.content as GoogleServiceInfoPlist | undefined;
    const androidContent = firebaseDetection.android?.content as GoogleServicesJson | undefined;
    result.firebaseProjectId =
      iosContent?.PROJECT_ID || androidContent?.project_info?.project_id || null;
    if (iosContent?.TEAM_ID) {
      result.teamId = iosContent.TEAM_ID;
    }
  } catch {
    result.firebaseProjectId = null;
  }

  result.success = true;
  setState((s) => ({ ...s, phase: 'complete' }));
  return result;
}

export const IosSetupUI: React.FC<IosSetupUIProps> = ({
  options,
  appleAuthContext,
  onComplete,
}) => {
  const { exit } = useApp();
  const { isRawModeSupported, setRawMode } = useStdin();
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
    appleId: '',
    password: '',
    authError: null,
    analysisResult: null,
  });
  const [result, setResult] = useState<IosSetupResult | null>(null);
  const authContextRef = useRef<UserAuthContext | null>(appleAuthContext ?? null);

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
    analysisResult,
  } = state;

  // Re-enable raw mode when entering input phases (expo/apple-utils can leave stdin in cooked mode)
  useEffect(() => {
    if (!isRawModeSupported) return;
    const needsInput = phase === 'auth_apple_id_input' || phase === 'auth_password_input';
    if (needsInput) setRawMode(true);
  }, [isRawModeSupported, phase, setRawMode]);

  // Allow ESC/Ctrl+C to skip portal sync during auth phases
  const isAuthPhase =
    phase === 'auth_apple_id_input' ||
    phase === 'auth_restoring_session' ||
    phase === 'auth_password_input' ||
    phase === 'auth_logging_in';

  const handleSkipPortalSync = useCallback(
    (reason: string) => {
      if (!analysisResult) return;
      setState((s) => ({
        ...s,
        portalSkipped: true,
        portalSkipReason: reason,
        phase: 'updating_entitlements',
      }));
      // Run post-auth without portal sync
      runPostAuth(analysisResult, null, true, reason, options, setState)
        .then((r) => setResult(r))
        .catch((error) => {
          const message = error instanceof Error ? getAppleApiErrorMessage(error) : String(error);
          setState((s) => ({ ...s, errorMessage: message, phase: 'error' }));
        });
    },
    [analysisResult, options],
  );

  useCancelInput(() => handleSkipPortalSync('Authentication cancelled by user'), {
    isActive: isAuthPhase,
  });

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

  // Perform portal sync with given auth context, then run post-auth
  const performSyncAndPostAuth = useCallback(
    async (authCtx: UserAuthContext, analysis: AnalysisResult) => {
      setState((s) => ({
        ...s,
        phase: 'syncing',
        authStatusMessage: 'Authenticated. Syncing Apple capabilities...',
      }));
      try {
        const syncResult = await runPortalSync(authCtx, analysis.bundleId, analysis.appGroupId);
        const r = await runPostAuth(analysis, syncResult, false, null, options, setState);
        setResult(r);
      } catch (error) {
        const reason =
          error instanceof Error ? getAppleApiErrorMessage(error) : 'Portal sync failed';
        if (isBundleIdMismatchReason(reason)) {
          setState((s) => ({ ...s, errorMessage: reason, phase: 'error' }));
          return;
        }
        // Portal sync is best-effort; continue with entitlements on failure
        const r = await runPostAuth(analysis, null, true, reason, options, setState);
        setResult(r);
      }
    },
    [options],
  );

  // Phase 1: Run analysis, then decide auth path
  useEffect(() => {
    const execute = async () => {
      try {
        const analysis = await runAnalysis(options);
        setState((s) => ({
          ...s,
          projectInfo: analysis.project,
          analysisResult: analysis,
        }));

        // If pre-authenticated context is provided, try using it directly
        if (appleAuthContext) {
          try {
            await performSyncAndPostAuth(appleAuthContext, analysis);
            return;
          } catch {
            // Auth context expired or invalid; fall through to Ink-based login
          }
        }

        // No auth context or expired: show Apple login UI
        setState((s) => ({ ...s, phase: 'auth_apple_id_input' }));
      } catch (error) {
        const message = error instanceof Error ? getAppleApiErrorMessage(error) : String(error);
        setState((s) => ({ ...s, errorMessage: message, phase: 'error' }));
      }
    };

    execute();
  }, [options, appleAuthContext, performSyncAndPostAuth]);

  // Handle Apple ID submission
  const handleAppleIdSubmit = useCallback(async () => {
    const trimmedAppleId = state.appleId.trim();
    if (!trimmedAppleId) {
      setState((s) => ({ ...s, authError: 'Apple ID is required' }));
      return;
    }

    setState((s) => ({
      ...s,
      authError: null,
      phase: 'auth_restoring_session',
      authStatusMessage: 'Checking existing session...',
    }));

    Auth.resetInMemoryData();

    try {
      const restoredSession = await Auth.tryRestoringAuthStateFromUserCredentialsAsync(
        { username: trimmedAppleId },
        { autoResolveProvider: true },
      );

      if (restoredSession?.context.teamId && analysisResult) {
        // Session restored — build auth context via loginWithUserCredentialsAsync
        const promptAppleIdFn = async () => trimmedAppleId;
        const promptPasswordFn = async () => '';
        const promptConfirmFn = async () => false;

        try {
          const authCtx = await loginWithUserCredentialsAsync(
            promptAppleIdFn,
            promptPasswordFn,
            promptConfirmFn,
            {},
          );
          authContextRef.current = authCtx;
          await performSyncAndPostAuth(authCtx, analysisResult);
          return;
        } catch {
          // Session restore via loginWithUserCredentials failed; fall through to password
        }
      }

      // No valid session; need password
      setState((s) => ({ ...s, phase: 'auth_password_input' }));
    } catch {
      setState((s) => ({ ...s, phase: 'auth_password_input' }));
    }
  }, [state.appleId, analysisResult, performSyncAndPostAuth]);

  // Handle password submission
  const handlePasswordSubmit = useCallback(async () => {
    if (!state.password) {
      setState((s) => ({ ...s, authError: 'Password is required' }));
      return;
    }

    const trimmedAppleId = state.appleId.trim();
    setState((s) => ({
      ...s,
      authError: null,
      phase: 'auth_logging_in',
      authStatusMessage: 'Authenticating with Apple...',
    }));

    try {
      const promptAppleIdFn = async () => trimmedAppleId;
      const promptPasswordFn = async () => state.password;
      const promptConfirmFn = async () => false;

      const authCtx = await loginWithUserCredentialsAsync(
        promptAppleIdFn,
        promptPasswordFn,
        promptConfirmFn,
        {},
      );
      authContextRef.current = authCtx;

      if (analysisResult) {
        await performSyncAndPostAuth(authCtx, analysisResult);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      if (message === 'ABORTED') {
        handleSkipPortalSync('Authentication cancelled by user');
        return;
      }
      setState((s) => ({
        ...s,
        authError: message,
        password: '',
        phase: 'auth_password_input',
      }));
    }
  }, [state.appleId, state.password, analysisResult, performSyncAndPostAuth, handleSkipPortalSync]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="iOS Setup" />

      {/* Phase: Analyzing */}
      {phase === 'analyzing' && <StatusMessage type="loading" message="Analyzing iOS project..." />}

      {/* Phase: Apple ID Input */}
      {phase === 'auth_apple_id_input' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
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
              <Text dimColor>Log in to sync capabilities with Apple Developer Portal.</Text>
            </Box>
            {state.authError && (
              <Box marginBottom={1}>
                <Text color="red">✗ {state.authError}</Text>
              </Box>
            )}
            <Box marginBottom={1}>
              <Text>Apple ID (email): </Text>
            </Box>
            <Box>
              <Text color="blue">{'> '}</Text>
              <TextInput
                value={state.appleId}
                onChange={(v) => setState((s) => ({ ...s, appleId: v }))}
                placeholder="your@email.com"
                onSubmit={handleAppleIdSubmit}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to continue · Esc/Ctrl+C to skip portal sync</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Phase: Restoring Session */}
      {phase === 'auth_restoring_session' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
          <Box marginLeft={2}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> {authStatusMessage}</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Password Input */}
      {phase === 'auth_password_input' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
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
              <Text dimColor>Apple ID: {state.appleId.trim()}</Text>
            </Box>
            {state.authError && (
              <Box marginBottom={1}>
                <Text color="red">✗ {state.authError}</Text>
              </Box>
            )}
            <Box marginBottom={1}>
              <Text>Password: </Text>
            </Box>
            <Box>
              <Text color="blue">{'> '}</Text>
              <TextInput
                value={state.password}
                onChange={(v) => setState((s) => ({ ...s, password: v }))}
                placeholder="••••••••"
                mask="*"
                onSubmit={handlePasswordSubmit}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Your password is stored securely in your local Keychain</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to continue · Esc/Ctrl+C to skip portal sync</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Phase: Logging In */}
      {phase === 'auth_logging_in' && (
        <Box flexDirection="column">
          <ProjectInfoStatus projectInfo={projectInfo} />
          <Box marginLeft={2}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> {authStatusMessage}</Text>
          </Box>
          <Box marginTop={1} marginLeft={2}>
            <Text dimColor>If prompted, check your device for 2FA code</Text>
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
