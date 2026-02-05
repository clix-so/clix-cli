import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  type AgentContext,
  analyzeIosProject,
  buildAgentContext,
  type CapabilitySyncResult,
  createAuthContext,
  generateAppGroupId,
  getAppleApiErrorMessage,
  getEntitlementsPath,
  getIosProjectDir,
  type IosProjectInfo,
  loadApiKeyFromFile,
  readEntitlements,
  syncCapabilities,
  updateEntitlementsForClix,
} from '@/lib/ios';
import { FirebaseService } from '@/lib/services/firebase';
import type { GoogleServiceInfoPlist, GoogleServicesJson } from '@/lib/services/firebase/types';
import { detectProjectType } from '@/lib/services/project-detector';
import { Header } from '@/ui/components/Header';
import { StatusMessage } from '@/ui/components/StatusMessage';

type SetupPhase =
  | 'analyzing'
  | 'authenticating'
  | 'syncing'
  | 'updating_entitlements'
  | 'complete'
  | 'error';

export interface IosSetupOptions {
  /** Path to .p8 API Key file */
  apiKeyPath?: string;
  /** API Key ID */
  keyId?: string;
  /** Issuer ID */
  issuerId?: string;
  /** Bundle ID (override auto-detection) */
  bundleId?: string;
  /** Skip Apple Developer Portal sync */
  skipPortal?: boolean;
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
}

interface IosSetupUIProps {
  options: IosSetupOptions;
  onComplete?: (result: IosSetupResult) => void;
}

interface SetupState {
  phase: SetupPhase;
  projectInfo: IosProjectInfo | null;
  portalResult: CapabilitySyncResult | null;
  updatedFiles: string[];
  errorMessage: string;
}

/**
 * Sync capabilities with Apple Developer Portal
 */
async function syncWithPortal(
  options: IosSetupOptions,
  bundleId: string,
  appGroupId: string,
  setPhase: (phase: SetupPhase) => void,
): Promise<CapabilitySyncResult | null> {
  // Check for partial credentials - user provided some but not all
  const hasAnyCreds = !!(options.apiKeyPath || options.keyId || options.issuerId);
  const hasAllCreds = !!(options.apiKeyPath && options.keyId && options.issuerId);

  if (!options.skipPortal && hasAnyCreds && !hasAllCreds) {
    throw new Error(
      'Incomplete portal credentials. Provide --api-key, --key-id, and --issuer-id together, or use --skip-portal.',
    );
  }

  if (options.skipPortal || !hasAllCreds) {
    return null;
  }

  // At this point, hasAllCreds is true, so all credentials are defined
  const { apiKeyPath, keyId, issuerId } = options as Required<
    Pick<IosSetupOptions, 'apiKeyPath' | 'keyId' | 'issuerId'>
  >;

  setPhase('authenticating');
  const keyP8 = loadApiKeyFromFile(apiKeyPath);
  const authContext = await createAuthContext({
    apiKey: {
      keyId,
      issuerId,
      keyP8,
    },
  });

  setPhase('syncing');
  return await syncCapabilities(authContext, bundleId, appGroupId);
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

  // Phase 2: Sync with Apple Developer Portal (if not skipped)
  const syncResult = await syncWithPortal(options, bundleId, appGroupId, (phase) =>
    setState((s) => ({ ...s, phase })),
  );
  if (syncResult) {
    setState((s) => ({ ...s, portalResult: syncResult }));
    result.portalSync = syncResult;
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
    updatedFiles: [],
    errorMessage: '',
  });
  const [result, setResult] = useState<IosSetupResult | null>(null);

  const { phase, projectInfo, portalResult, updatedFiles, errorMessage } = state;

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
          <StatusMessage type="loading" message="Authenticating with Apple Developer Portal..." />
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
          <PortalSyncStatus portalResult={portalResult} skipPortal={options.skipPortal} />
          <StatusMessage type="loading" message="Updating entitlements files..." />
        </Box>
      )}

      {/* Phase: Complete */}
      {phase === 'complete' && (
        <CompletePhase
          projectInfo={projectInfo}
          portalResult={portalResult}
          updatedFiles={updatedFiles}
          skipPortal={options.skipPortal}
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
  skipPortal?: boolean;
}> = ({ portalResult, skipPortal }) => {
  if (skipPortal) {
    return <StatusMessage type="info" message="Portal sync skipped" />;
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
  updatedFiles: string[];
  skipPortal?: boolean;
}> = ({ projectInfo, portalResult, updatedFiles, skipPortal }) => (
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

    {skipPortal && (
      <StatusMessage type="info" message="Portal sync skipped (use --api-key to enable)" />
    )}

    <StatusMessage type="success" message="Entitlements files updated" />
    {updatedFiles.map((file) => (
      <Box key={file} marginLeft={2}>
        <Text dimColor>• {file}</Text>
      </Box>
    ))}

    <Box marginTop={1}>
      <Text bold color="green">
        ✓ iOS setup completed successfully!
      </Text>
    </Box>

    {/* Next steps */}
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Next steps:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>1. Open your project in Xcode</Text>
        <Text>2. Go to Signing &amp; Capabilities tab</Text>
        <Text>3. Verify the capabilities are enabled</Text>
        {!skipPortal && <Text>4. Regenerate provisioning profiles if needed</Text>}
      </Box>
    </Box>

    <Box marginTop={1}>
      <Text color="cyan">Press Enter to continue</Text>
    </Box>
  </Box>
);
