/**
 * Push Notification setup wizard component.
 *
 * @module ui/components/PushSetupWizard
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openBrowser } from '@/lib/auth/browser';
import { analyzeIosProject } from '@/lib/ios';
import {
  APNS_KEY_CREATION_STEPS,
  FIREBASE_UPLOAD_STEPS,
  getKeyIdError,
  getTeamIdError,
  PUSH_SETUP_URLS,
  type PushSetupContext,
  type PushSetupPhase,
  type PushSetupResult,
  validateP8File,
} from '@/lib/push';
import {
  FirebaseDownloader,
  type FirebaseProject,
  FirebaseService,
  isOAuthConfigured,
} from '@/lib/services/firebase';
import type { GoogleServiceInfoPlist, GoogleServicesJson } from '@/lib/services/firebase/types';

interface PushSetupWizardProps {
  projectPath: string;
  onComplete: (result: PushSetupResult) => void;
  onCancel?: () => void;
  /** Pre-detected Bundle ID from ios-setup */
  preDetectedBundleId?: string;
  /** Pre-detected Firebase Project ID from ios-setup */
  preDetectedFirebaseProjectId?: string | null;
  /** Pre-detected Team ID from Firebase config */
  preDetectedTeamId?: string | null;
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
        <Text bold>Push Notification Setup</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Detecting project configuration...</Text>
      </Box>
    </Box>
  );
}

/**
 * Status phase component.
 */
function StatusPhase({
  context,
  onContinue,
  onCancel,
}: {
  context: PushSetupContext;
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    } else if (key.escape) {
      onCancel();
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
      <Box marginBottom={1}>
        <Text bold>Push Notification Setup</Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text>Firebase Project: </Text>
          {context.firebaseProjectId ? (
            <Text color="green">{context.firebaseProjectId}</Text>
          ) : (
            <Text color="yellow">not configured</Text>
          )}
        </Box>
        <Box>
          <Text>Bundle ID: </Text>
          {context.bundleId ? (
            <Text color="green">{context.bundleId}</Text>
          ) : (
            <Text color="yellow">not detected</Text>
          )}
        </Box>
      </Box>
      <Box>
        <Text dimColor>Press Enter to continue, Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Key source selection phase component.
 */
function KeySourcePhase({
  onHasKey,
  onNoKey,
  onCancel,
}: {
  onHasKey: () => void;
  onNoKey: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = [
    { label: 'Yes, I have an APNS key (.p8 file)', value: 'has_key' },
    { label: 'No, I need to create one', value: 'no_key' },
    { label: 'Cancel', value: 'cancel' },
  ];

  const handleSelect = (item: { value: string }) => {
    switch (item.value) {
      case 'has_key':
        onHasKey();
        break;
      case 'no_key':
        onNoKey();
        break;
      case 'cancel':
        onCancel();
        break;
    }
  };

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
        <Text bold>Do you have an existing APNS key?</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Apple guide phase component.
 */
function AppleGuidePhase({
  onContinue,
  onCancel,
}: {
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [browserOpened, setBrowserOpened] = useState(false);

  useEffect(() => {
    if (!browserOpened) {
      openBrowser(PUSH_SETUP_URLS.appleCreateKey);
      setBrowserOpened(true);
    }
  }, [browserOpened]);

  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    } else if (key.escape) {
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
        <Text bold>Create APNS Key in Apple Developer Portal</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Browser opened to Apple Developer Portal</Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Steps:</Text>
        {APNS_KEY_CREATION_STEPS.map((step) => (
          <Text key={step} dimColor>
            {APNS_KEY_CREATION_STEPS.indexOf(step) + 1}. {step}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">Press Enter when you have copied the .p8 file to this directory</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Find .p8 files in the current directory.
 */
function findP8Files(): string[] {
  try {
    const cwd = process.cwd();
    const files = fs.readdirSync(cwd);
    return files
      .filter((f) => f.endsWith('.p8'))
      .map((f) => `./${f}`)
      .sort();
  } catch {
    return [];
  }
}

/**
 * P8 input phase component.
 */
function P8InputPhase({
  suggestedKeyId,
  suggestedTeamId,
  onSubmit,
  onCancel,
}: {
  suggestedKeyId?: string;
  suggestedTeamId?: string;
  onSubmit: (p8Path: string, keyId: string, teamId: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [stage, setStage] = useState<'p8_select' | 'p8_path' | 'key_id' | 'team_id'>('p8_select');
  const [foundFiles, setFoundFiles] = useState<string[]>([]);
  const [p8Path, setP8Path] = useState('');
  const [keyId, setKeyId] = useState(suggestedKeyId || '');
  const [teamId, setTeamId] = useState(suggestedTeamId || '');
  const [error, setError] = useState<string | null>(null);
  const [extractedKeyId, setExtractedKeyId] = useState<string | null>(null);
  const [prefilledTeamId] = useState<string | null>(suggestedTeamId || null);

  // Search for .p8 files on mount
  useEffect(() => {
    const files = findP8Files();
    setFoundFiles(files);
    // If no files found, go directly to manual input
    if (files.length === 0) {
      setStage('p8_path');
    }
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
    // Open Team ID page when 't' is pressed in team_id stage
    if (stage === 'team_id' && input === 't') {
      openBrowser(PUSH_SETUP_URLS.appleTeamId);
    }
  });

  const handleFileSelect = useCallback((item: { label: string; value: string }) => {
    if (item.value === 'manual') {
      setStage('p8_path');
      return;
    }

    const result = validateP8File(item.value);
    if (!result.valid) {
      setError(result.error || 'Invalid P8 file');
      return;
    }

    setP8Path(item.value);
    setError(null);
    if (result.suggestedKeyId) {
      setExtractedKeyId(result.suggestedKeyId);
      setKeyId(result.suggestedKeyId);
    }
    setStage('key_id');
  }, []);

  const handleP8PathSubmit = useCallback(() => {
    if (!p8Path.trim()) {
      setError('P8 file path is required');
      return;
    }

    const result = validateP8File(p8Path.trim());
    if (!result.valid) {
      setError(result.error || 'Invalid P8 file');
      return;
    }

    setError(null);
    if (result.suggestedKeyId) {
      setExtractedKeyId(result.suggestedKeyId);
      setKeyId(result.suggestedKeyId);
    }
    setStage('key_id');
  }, [p8Path]);

  const handleKeyIdSubmit = useCallback(() => {
    const keyIdError = getKeyIdError(keyId.trim());
    if (keyIdError) {
      setError(keyIdError);
      return;
    }
    setError(null);
    setStage('team_id');
  }, [keyId]);

  const handleTeamIdSubmit = useCallback(() => {
    const teamIdError = getTeamIdError(teamId.trim());
    if (teamIdError) {
      setError(teamIdError);
      return;
    }
    setError(null);
    onSubmit(p8Path.trim(), keyId.trim().toUpperCase(), teamId.trim().toUpperCase());
  }, [p8Path, keyId, teamId, onSubmit]);

  // Build selection items for found files
  const fileItems = [
    ...foundFiles.map((f) => ({
      label: `${path.basename(f)}`,
      value: f,
    })),
    { label: 'Enter path manually...', value: 'manual' },
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
        <Text bold>Enter APNS Key Information</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {stage === 'p8_select' && foundFiles.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text>
              Found <Text color="green">{foundFiles.length}</Text> P8 file(s) in current directory:
            </Text>
          </Box>
          <SelectInput items={fileItems} onSelect={handleFileSelect} />
        </>
      )}

      {stage === 'p8_path' && (
        <>
          <Box marginBottom={1}>
            <Text>
              Path to P8 file: <Text dimColor>(e.g., ./AuthKey_XXXXXXXXXX.p8)</Text>
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Tip: Copy the file to this directory to avoid permission issues</Text>
          </Box>
          <Box>
            <Text color="blue">{'> '}</Text>
            <TextInput
              value={p8Path}
              onChange={setP8Path}
              placeholder="./AuthKey_XXXXXXXXXX.p8"
              onSubmit={handleP8PathSubmit}
            />
          </Box>
        </>
      )}

      {stage === 'key_id' && (
        <>
          <Box marginBottom={1}>
            <Text dimColor>P8 file: {p8Path}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              Key ID: <Text dimColor>(10 characters, e.g., ABCD123456)</Text>
            </Text>
          </Box>
          {extractedKeyId && (
            <Box marginBottom={1}>
              <Text color="green">✓ Extracted from filename: {extractedKeyId}</Text>
            </Box>
          )}
          <Box>
            <Text color="blue">{'> '}</Text>
            <TextInput
              value={keyId}
              onChange={setKeyId}
              placeholder="XXXXXXXXXX"
              onSubmit={handleKeyIdSubmit}
            />
          </Box>
        </>
      )}

      {stage === 'team_id' && (
        <>
          <Box marginBottom={1}>
            <Text dimColor>P8 file: {p8Path}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Key ID: {keyId}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              Apple Team ID: <Text dimColor>(10 characters)</Text>
            </Text>
          </Box>
          {prefilledTeamId && (
            <Box marginBottom={1}>
              <Text color="green">✓ Detected from Xcode project: {prefilledTeamId}</Text>
            </Box>
          )}
          {!prefilledTeamId && (
            <Box flexDirection="column" marginBottom={1}>
              <Text dimColor>
                Find your Team ID at:{' '}
                <Text color="cyan" underline>
                  developer.apple.com/account
                </Text>
              </Text>
              <Text dimColor>→ Look for "Team ID" in the "Membership details" card</Text>
            </Box>
          )}
          <Box>
            <Text color="blue">{'> '}</Text>
            <TextInput
              value={teamId}
              onChange={setTeamId}
              placeholder="ABCD123456"
              onSubmit={handleTeamIdSubmit}
            />
          </Box>
          {!prefilledTeamId && (
            <Box marginTop={1}>
              <Text dimColor>Press 't' to open Team ID page in browser</Text>
            </Box>
          )}
        </>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {stage === 'p8_select'
            ? '↑↓ navigate · Enter select · Esc cancel'
            : 'Enter to continue · Esc to cancel'}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Firebase authentication phase component.
 */
function FirebaseAuthPhase({ onCancel }: { onCancel: () => void }): React.ReactElement {
  useInput((_input, key) => {
    const isCtrlC = (_input === 'c' && key.ctrl) || _input === '\x03';
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
        <Text> Authenticating with Firebase...</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>A browser window will open for authentication</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Firebase project selection phase component.
 */
function FirebaseProjectsPhase({
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
    value: p.projectId,
  }));

  const handleSelect = useCallback(
    (item: { label: string; value: string }) => {
      const project = projects.find((p) => p.projectId === item.value);
      if (project) {
        onSelect(project);
      }
    },
    [onSelect, projects],
  );

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
      <Box marginBottom={1}>
        <Text dimColor>Choose the project to upload APNS key:</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Firebase upload phase component.
 */
function FirebaseUploadPhase({
  context,
  selectedProject,
  onComplete,
  onCancel,
}: {
  context: PushSetupContext;
  selectedProject: FirebaseProject | null;
  onComplete: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [browserOpened, setBrowserOpened] = useState(false);

  useEffect(() => {
    if (!browserOpened && selectedProject) {
      const url = PUSH_SETUP_URLS.firebaseConsole(selectedProject.projectId);
      openBrowser(url);
      setBrowserOpened(true);
    }
  }, [browserOpened, selectedProject]);

  useInput((_input, key) => {
    if (key.return) {
      onComplete();
    } else if (key.escape) {
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
        <Text bold>Upload APNS Key to Firebase</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Project:{' '}
          <Text color="cyan">{selectedProject?.displayName || selectedProject?.projectId}</Text>
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Browser opened to Firebase Console → Cloud Messaging</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="cyan">
          Information to enter in Firebase:
        </Text>
        <Box marginTop={1}>
          <Text>Key ID: </Text>
          <Text color="green" bold>
            {context.pushKey?.apnsKeyId || 'N/A'}
          </Text>
        </Box>
        <Box>
          <Text>Team ID: </Text>
          <Text color="green" bold>
            {context.pushKey?.teamId || 'N/A'}
          </Text>
        </Box>
        <Box>
          <Text>P8 File: </Text>
          <Text dimColor>{context.p8FilePath || 'N/A'}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Steps:</Text>
        {FIREBASE_UPLOAD_STEPS.map((step) => (
          <Text key={step} dimColor>
            {FIREBASE_UPLOAD_STEPS.indexOf(step) + 1}. {step}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">Press Enter when upload is complete</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Complete phase component.
 */
function CompletePhase({
  context,
  cancelled,
}: {
  context: PushSetupContext;
  cancelled: boolean;
}): React.ReactElement {
  if (cancelled) {
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
            ! Push notification setup cancelled
          </Text>
        </Box>
        <Box>
          <Text dimColor>You can run /push-setup later to configure push notifications.</Text>
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
          ✓ Push Notification Setup Complete
        </Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text dimColor>Key ID: </Text>
          <Text>{context.pushKey?.apnsKeyId || 'N/A'}</Text>
        </Box>
        <Box>
          <Text dimColor>Team ID: </Text>
          <Text>{context.pushKey?.teamId || 'N/A'}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Your iOS app is now configured to receive push notifications.</Text>
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
  onCancel,
}: {
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onRetry();
    } else if (key.escape) {
      onCancel();
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
          Push Notification Setup Error
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="red">✗ {error}</Text>
      </Box>
      <Box>
        <Text dimColor>Press Enter to retry, Esc to cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Detection result from project analysis.
 */
interface DetectionResult {
  firebaseProjectId: string | null;
  bundleId: string | null;
  teamId: string | null;
}

/**
 * Detect project configuration from Firebase config.
 */
async function detectFromFirebase(projectPath: string): Promise<DetectionResult> {
  const result: DetectionResult = {
    firebaseProjectId: null,
    bundleId: null,
    teamId: null,
  };

  try {
    const firebaseService = new FirebaseService(projectPath);
    const detection = await firebaseService.detect();

    const iosContent = detection.ios?.content as GoogleServiceInfoPlist | undefined;
    const androidContent = detection.android?.content as GoogleServicesJson | undefined;

    result.firebaseProjectId =
      iosContent?.PROJECT_ID || androidContent?.project_info?.project_id || null;
    result.bundleId = iosContent?.BUNDLE_ID || null;
    result.teamId = iosContent?.TEAM_ID || null;
  } catch {
    // Firebase detection failed
  }

  return result;
}

/**
 * Detect Team ID and Bundle ID from Xcode project.
 */
async function detectFromXcodeProject(
  projectPath: string,
): Promise<{ teamId: string | null; bundleId: string | null }> {
  try {
    const analysis = await analyzeIosProject(projectPath);
    if (analysis.success && analysis.project) {
      return {
        teamId: analysis.project.teamId || null,
        bundleId: analysis.project.bundleId || null,
      };
    }
  } catch {
    // iOS project analysis failed
  }
  return { teamId: null, bundleId: null };
}

/**
 * Push notification setup wizard component.
 */
export const PushSetupWizard: React.FC<PushSetupWizardProps> = ({
  projectPath,
  onComplete,
  onCancel,
  preDetectedBundleId,
  preDetectedFirebaseProjectId,
  preDetectedTeamId,
}) => {
  const [phase, setPhase] = useState<PushSetupPhase>('detecting');
  const [context, setContext] = useState<PushSetupContext>({
    bundleId: null,
    firebaseProjectId: null,
    pushKey: null,
    p8FilePath: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [detectedTeamId, setDetectedTeamId] = useState<string | null>(preDetectedTeamId ?? null);

  // Firebase OAuth state
  const downloaderRef = useRef<FirebaseDownloader | null>(null);
  const [projects, setProjects] = useState<FirebaseProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<FirebaseProject | null>(null);

  // Initial detection
  useEffect(() => {
    const detect = async () => {
      // Use pre-detected values if available (from ios-setup integration)
      if (preDetectedBundleId !== undefined || preDetectedFirebaseProjectId !== undefined) {
        setContext((prev) => ({
          ...prev,
          firebaseProjectId: preDetectedFirebaseProjectId ?? null,
          bundleId: preDetectedBundleId ?? null,
        }));
        if (preDetectedTeamId) {
          setDetectedTeamId(preDetectedTeamId);
        }
        setPhase('status');
        return;
      }

      // Detect from Firebase config
      const firebaseResult = await detectFromFirebase(projectPath);
      let { firebaseProjectId, bundleId, teamId } = firebaseResult;

      // Try Xcode project if Team ID not found in Firebase config
      if (!teamId) {
        const xcodeResult = await detectFromXcodeProject(projectPath);
        teamId = xcodeResult.teamId;
        if (!bundleId) {
          bundleId = xcodeResult.bundleId;
        }
      }

      if (teamId) {
        setDetectedTeamId(teamId);
      }

      setContext((prev) => ({
        ...prev,
        firebaseProjectId,
        bundleId,
      }));
      setPhase('status');
    };

    if (phase === 'detecting') {
      detect();
    }
  }, [phase, projectPath, preDetectedBundleId, preDetectedFirebaseProjectId, preDetectedTeamId]);

  // Firebase authentication effect
  useEffect(() => {
    const authenticateAndFetchProjects = async () => {
      try {
        // Create downloader if not exists
        if (!downloaderRef.current) {
          downloaderRef.current = new FirebaseDownloader();
        }
        const downloader = downloaderRef.current;

        // Authenticate with Firebase
        await downloader.authenticate(openBrowser);

        // Fetch projects
        const fetchedProjects = await downloader.listProjects();
        setProjects(fetchedProjects);

        // If pre-detected project exists, try to find and auto-select it
        if (context.firebaseProjectId) {
          const matchingProject = fetchedProjects.find(
            (p) => p.projectId === context.firebaseProjectId,
          );
          if (matchingProject) {
            setSelectedProject(matchingProject);
            setPhase('firebase_upload');
            return;
          }
        }

        // Otherwise, show project selection
        if (fetchedProjects.length === 1) {
          // Auto-select if only one project
          setSelectedProject(fetchedProjects[0]);
          setPhase('firebase_upload');
        } else if (fetchedProjects.length > 1) {
          setPhase('firebase_projects');
        } else {
          setError('No Firebase projects found');
          setPhase('error');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Firebase authentication failed';
        setError(message);
        setPhase('error');
      }
    };

    if (phase === 'firebase_auth') {
      authenticateAndFetchProjects();
    }
  }, [phase, context.firebaseProjectId]);

  const handleContinue = useCallback(() => {
    setPhase('key_source');
  }, []);

  const handleCancel = useCallback(() => {
    setCancelled(true);
    setPhase('complete');
    if (onCancel) {
      onCancel();
    } else {
      onComplete({
        success: false,
        message: 'Push notification setup cancelled',
      });
    }
  }, [onCancel, onComplete]);

  const handleHasKey = useCallback(() => {
    setPhase('p8_input');
  }, []);

  const handleNoKey = useCallback(() => {
    setPhase('apple_guide');
  }, []);

  const handleAppleGuideComplete = useCallback(() => {
    setPhase('p8_input');
  }, []);

  const handleP8Submit = useCallback((p8Path: string, keyId: string, teamId: string) => {
    const result = validateP8File(p8Path);
    if (!result.valid || !result.content) {
      setError(result.error || 'Invalid P8 file');
      setPhase('error');
      return;
    }

    // Store content in a variable to ensure TypeScript type narrowing
    const p8Content = result.content;

    setContext((prev) => ({
      ...prev,
      pushKey: {
        apnsKeyP8: p8Content,
        apnsKeyId: keyId,
        teamId,
      },
      p8FilePath: p8Path,
    }));
    // Check if Firebase OAuth is configured
    if (isOAuthConfigured()) {
      setPhase('firebase_auth');
    } else {
      // Fallback: open Firebase console directly with detected project
      setPhase('firebase_upload');
    }
  }, []);

  const handleProjectSelect = useCallback((project: FirebaseProject) => {
    setSelectedProject(project);
    setPhase('firebase_upload');
  }, []);

  const handleFirebaseComplete = useCallback(() => {
    setPhase('complete');
    onComplete({
      success: true,
      message: 'Push notification setup complete',
      context,
    });
  }, [context, onComplete]);

  const handleRetry = useCallback(() => {
    setError(null);
    setPhase('status');
  }, []);

  switch (phase) {
    case 'detecting':
      return <DetectingPhase />;

    case 'status':
      return <StatusPhase context={context} onContinue={handleContinue} onCancel={handleCancel} />;

    case 'key_source':
      return (
        <KeySourcePhase onHasKey={handleHasKey} onNoKey={handleNoKey} onCancel={handleCancel} />
      );

    case 'apple_guide':
      return <AppleGuidePhase onContinue={handleAppleGuideComplete} onCancel={handleCancel} />;

    case 'p8_input':
      return (
        <P8InputPhase
          suggestedTeamId={detectedTeamId ?? undefined}
          onSubmit={handleP8Submit}
          onCancel={handleCancel}
        />
      );

    case 'firebase_auth':
      return <FirebaseAuthPhase onCancel={handleCancel} />;

    case 'firebase_projects':
      return (
        <FirebaseProjectsPhase
          projects={projects}
          onSelect={handleProjectSelect}
          onCancel={handleCancel}
        />
      );

    case 'firebase_upload':
      return (
        <FirebaseUploadPhase
          context={context}
          selectedProject={selectedProject}
          onComplete={handleFirebaseComplete}
          onCancel={handleCancel}
        />
      );

    case 'complete':
      return <CompletePhase context={context} cancelled={cancelled} />;

    case 'error':
      return (
        <ErrorPhase
          error={error || 'Unknown error'}
          onRetry={handleRetry}
          onCancel={handleCancel}
        />
      );

    default:
      return <DetectingPhase />;
  }
};
