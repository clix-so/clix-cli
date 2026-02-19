/**
 * Push Notification setup task components.
 *
 * @module ui/components/push-setup/PushSetupTasks
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
import { PROJECT_CONFIG_DIR } from '@/lib/config/project-config-schema';
import { analyzeIosProject } from '@/lib/ios';
import {
  APNS_KEY_CREATION_STEPS,
  FIREBASE_UPLOAD_STEPS,
  getKeyIdError,
  getTeamIdError,
  PUSH_SETUP_URLS,
  type PushSetupContext,
  validateP8File,
} from '@/lib/push';
import { FirebaseDownloader, type FirebaseProject, FirebaseService } from '@/lib/services/firebase';
import type { GoogleServiceInfoPlist, GoogleServicesJson } from '@/lib/services/firebase/types';
import { detectProjectType } from '@/lib/services/project-detector';
import { isCtrlCInput, useCancelInput } from '@/ui/hooks';
import { formatTerminalHyperlink } from '@/ui/utils/terminalHyperlink';
import { AppleLoginUI } from '../AppleLoginUI';
import { normalizeInputFilePath } from '../file-input-utils';

export interface DetectionResult {
  firebaseProjectId: string | null;
  bundleId: string | null;
  teamId: string | null;
}

interface DetectionTaskOptions {
  projectPath: string;
  preDetectedBundleId?: string;
  preDetectedFirebaseProjectId?: string | null;
  preDetectedTeamId?: string | null;
}

export interface ApnsKeyAcquisitionResult {
  pushKey: NonNullable<PushSetupContext['pushKey']>;
  p8FilePath: string | null;
}

interface ErrorPhaseProps {
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}

function ErrorPhase({ error, onRetry, onCancel }: ErrorPhaseProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onRetry();
    }
  });

  useCancelInput(onCancel);

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
        <Text dimColor>Press Enter to retry, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
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
    }
  });

  useCancelInput(onCancel);

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
        <Text dimColor>Press Enter to continue, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

async function detectFromFirebase(projectPath: string): Promise<DetectionResult> {
  const result: DetectionResult = {
    firebaseProjectId: null,
    bundleId: null,
    teamId: null,
  };

  try {
    const projectType = await detectProjectType(projectPath);
    const firebaseService = new FirebaseService(projectPath, projectType);
    const detection = await firebaseService.detect();

    const iosContent = detection.ios?.content as GoogleServiceInfoPlist | undefined;
    const androidContent = detection.android?.content as GoogleServicesJson | undefined;

    result.firebaseProjectId =
      iosContent?.PROJECT_ID || androidContent?.project_info?.project_id || null;
    result.bundleId = iosContent?.BUNDLE_ID || null;
    result.teamId = iosContent?.TEAM_ID || null;
  } catch {
    // Intentionally ignore detection errors and keep fallback values.
  }

  return result;
}

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
    // Intentionally ignore analyzer errors and keep fallback values.
  }

  return { teamId: null, bundleId: null };
}

function getPreDetectedResult(options: DetectionTaskOptions): DetectionResult | null {
  if (
    options.preDetectedBundleId === undefined &&
    options.preDetectedFirebaseProjectId === undefined &&
    options.preDetectedTeamId === undefined
  ) {
    return null;
  }

  return {
    firebaseProjectId: options.preDetectedFirebaseProjectId ?? null,
    bundleId: options.preDetectedBundleId ?? null,
    teamId: options.preDetectedTeamId ?? null,
  };
}

async function resolveDetectionResult(options: DetectionTaskOptions): Promise<DetectionResult> {
  const preDetected = getPreDetectedResult(options);
  if (preDetected) {
    return preDetected;
  }

  const firebaseResult = await detectFromFirebase(options.projectPath);
  if (firebaseResult.teamId) {
    return firebaseResult;
  }

  const xcodeResult = await detectFromXcodeProject(options.projectPath);
  return {
    firebaseProjectId: firebaseResult.firebaseProjectId,
    bundleId: firebaseResult.bundleId || xcodeResult.bundleId,
    teamId: xcodeResult.teamId,
  };
}

type DetectionTaskPhase = 'detecting' | 'status' | 'error';

export const PushDetectionTask: React.FC<{
  projectPath: string;
  preDetectedBundleId?: string;
  preDetectedFirebaseProjectId?: string | null;
  preDetectedTeamId?: string | null;
  onComplete: (result: DetectionResult) => void;
  onCancel: () => void;
}> = ({
  projectPath,
  preDetectedBundleId,
  preDetectedFirebaseProjectId,
  preDetectedTeamId,
  onComplete,
  onCancel,
}) => {
  const [phase, setPhase] = useState<DetectionTaskPhase>('detecting');
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectionResult>({
    firebaseProjectId: null,
    bundleId: null,
    teamId: preDetectedTeamId ?? null,
  });

  useEffect(() => {
    if (phase !== 'detecting') {
      return;
    }

    let cancelled = false;

    const detect = async () => {
      try {
        const detectionResult = await resolveDetectionResult({
          projectPath,
          preDetectedBundleId,
          preDetectedFirebaseProjectId,
          preDetectedTeamId,
        });
        if (cancelled) {
          return;
        }

        setDetected(detectionResult);
        setPhase('status');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to detect project configuration');
        setPhase('error');
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, [phase, preDetectedBundleId, preDetectedFirebaseProjectId, preDetectedTeamId, projectPath]);

  if (phase === 'detecting') {
    return <DetectingPhase />;
  }

  if (phase === 'error') {
    return (
      <ErrorPhase
        error={error || 'Unknown detection error'}
        onRetry={() => {
          setError(null);
          setPhase('detecting');
        }}
        onCancel={onCancel}
      />
    );
  }

  return (
    <StatusPhase
      context={{
        bundleId: detected.bundleId,
        firebaseProjectId: detected.firebaseProjectId,
        pushKey: null,
        p8FilePath: null,
      }}
      onContinue={() => onComplete(detected)}
      onCancel={onCancel}
    />
  );
};

function KeySourcePhase({
  onHasKey,
  onNoKey,
  onAppleLogin,
  onCancel,
}: {
  onHasKey: () => void;
  onNoKey: () => void;
  onAppleLogin: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const items = [
    { label: 'Yes, I have an APNS key (.p8 file)', value: 'has_key' },
    { label: 'Create with Apple Account (auto)', value: 'apple_login' },
    { label: 'Create manually in browser', value: 'no_key' },
    { label: 'Cancel', value: 'cancel' },
  ];

  const handleSelect = (item: { value: string }) => {
    switch (item.value) {
      case 'has_key':
        onHasKey();
        break;
      case 'apple_login':
        onAppleLogin();
        break;
      case 'no_key':
        onNoKey();
        break;
      case 'cancel':
        onCancel();
        break;
    }
  };

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
        <Text bold>Do you have an existing APNS key?</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

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
    }
  });

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
        <Text color="yellow">
          Press Enter when you have copied the .p8 file to ./{PROJECT_CONFIG_DIR}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

function findP8Files(): string[] {
  try {
    const cwd = process.cwd();
    const searchDirs = [cwd, path.join(cwd, PROJECT_CONFIG_DIR)];
    const files = new Set<string>();

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        continue;
      }

      const directoryFiles = fs.readdirSync(dir);
      for (const fileName of directoryFiles) {
        if (!fileName.endsWith('.p8')) {
          continue;
        }

        const fullPath = path.join(dir, fileName);
        const relativePath = path.relative(cwd, fullPath);
        files.add(relativePath.startsWith('.') ? relativePath : `./${relativePath}`);
      }
    }

    return [...files].sort();
  } catch {
    return [];
  }
}

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

  useEffect(() => {
    const files = findP8Files();
    setFoundFiles(files);
    if (files.length === 0) {
      setStage('p8_path');
    }
  }, []);

  useInput((input, key) => {
    if (key.escape || isCtrlCInput(input, key)) {
      onCancel();
    }
  });

  const handleFileSelect = useCallback((item: { label: string; value: string }) => {
    if (item.value === 'manual') {
      setStage('p8_path');
      return;
    }

    const normalizedP8Path = normalizeInputFilePath(item.value);
    const result = validateP8File(normalizedP8Path);
    if (!result.valid) {
      setError(result.error || 'Invalid P8 file');
      return;
    }

    setP8Path(normalizedP8Path);
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

    const normalizedP8Path = normalizeInputFilePath(p8Path);
    const result = validateP8File(normalizedP8Path);
    if (!result.valid) {
      setError(result.error || 'Invalid P8 file');
      return;
    }

    setP8Path(normalizedP8Path);
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
  }, [keyId, onSubmit, p8Path, teamId]);

  const fileItems = [
    ...foundFiles.map((filePath) => ({
      label: `${path.basename(filePath)}`,
      value: filePath,
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
              Found <Text color="green">{foundFiles.length}</Text> P8 file(s) in ./ or ./
              {PROJECT_CONFIG_DIR}:
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
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>1. Drag the .p8 file here → press Enter</Text>
            <Text dimColor>2. Or enter the file path manually</Text>
          </Box>
          <Box>
            <Text color="blue">{'>'} </Text>
            <TextInput
              value={p8Path}
              onChange={setP8Path}
              placeholder="Drag .p8 file here, or enter path manually"
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
            <Text color="blue">{'>'} </Text>
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
            <Text color="blue">{'>'} </Text>
            <TextInput
              value={teamId}
              onChange={setTeamId}
              placeholder="ABCD123456"
              onSubmit={handleTeamIdSubmit}
            />
          </Box>
        </>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {stage === 'p8_select'
            ? '↑↓ navigate · Enter select · Esc/Ctrl+C cancel'
            : 'Enter to continue · Esc/Ctrl+C to cancel'}
        </Text>
      </Box>
    </Box>
  );
}

type ApnsTaskPhase = 'key_source' | 'apple_login' | 'apple_guide' | 'p8_input' | 'error';

export const ApnsKeyAcquisitionTask: React.FC<{
  projectPath: string;
  suggestedTeamId?: string | null;
  onComplete: (result: ApnsKeyAcquisitionResult) => void;
  onCancel: () => void;
}> = ({ projectPath, suggestedTeamId, onComplete, onCancel }) => {
  const [phase, setPhase] = useState<ApnsTaskPhase>('key_source');
  const [error, setError] = useState<string | null>(null);

  const handleAppleLoginSuccess = useCallback(
    (result: {
      pushKey: { apnsKeyId: string; apnsKeyP8: string; teamId: string; teamName?: string };
    }) => {
      const p8FileName = `AuthKey_${result.pushKey.apnsKeyId}.p8`;
      const projectP8Path = path.join(projectPath, PROJECT_CONFIG_DIR, p8FileName);

      let savedPath: string | null = null;
      try {
        fs.mkdirSync(path.dirname(projectP8Path), { recursive: true });
        fs.writeFileSync(projectP8Path, result.pushKey.apnsKeyP8, {
          encoding: 'utf-8',
          mode: 0o600,
        });
        savedPath = projectP8Path;
      } catch {
        try {
          const fallbackPath = path.join(process.cwd(), PROJECT_CONFIG_DIR, p8FileName);
          fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
          fs.writeFileSync(fallbackPath, result.pushKey.apnsKeyP8, {
            encoding: 'utf-8',
            mode: 0o600,
          });
          savedPath = fallbackPath;
        } catch {
          setError(
            `Failed to write APNS key file under ${PROJECT_CONFIG_DIR}. Check directory permissions and try again.`,
          );
          setPhase('error');
          return;
        }
      }

      onComplete({
        pushKey: {
          apnsKeyP8: result.pushKey.apnsKeyP8,
          apnsKeyId: result.pushKey.apnsKeyId,
          teamId: result.pushKey.teamId,
        },
        p8FilePath: savedPath,
      });
    },
    [onComplete, projectPath],
  );

  const handleP8Submit = useCallback(
    (p8Path: string, keyId: string, teamId: string) => {
      const result = validateP8File(p8Path);
      if (!result.valid || !result.content) {
        setError(result.error || 'Invalid P8 file');
        setPhase('error');
        return;
      }

      onComplete({
        pushKey: {
          apnsKeyP8: result.content,
          apnsKeyId: keyId,
          teamId,
        },
        p8FilePath: p8Path,
      });
    },
    [onComplete],
  );

  if (phase === 'key_source') {
    return (
      <KeySourcePhase
        onHasKey={() => setPhase('p8_input')}
        onNoKey={() => setPhase('apple_guide')}
        onAppleLogin={() => setPhase('apple_login')}
        onCancel={onCancel}
      />
    );
  }

  if (phase === 'apple_login') {
    return (
      <AppleLoginUI
        onSuccess={handleAppleLoginSuccess}
        onCancel={onCancel}
        onFallback={() => setPhase('apple_guide')}
      />
    );
  }

  if (phase === 'apple_guide') {
    return <AppleGuidePhase onContinue={() => setPhase('p8_input')} onCancel={onCancel} />;
  }

  if (phase === 'p8_input') {
    return (
      <P8InputPhase
        suggestedTeamId={suggestedTeamId ?? undefined}
        onSubmit={handleP8Submit}
        onCancel={onCancel}
      />
    );
  }

  return (
    <ErrorPhase
      error={error || 'APNS key setup failed'}
      onRetry={() => {
        setError(null);
        setPhase('key_source');
      }}
      onCancel={onCancel}
    />
  );
};

function FirebaseAuthPhase({
  onCancel,
  authUrl,
}: {
  onCancel: () => void;
  authUrl?: string | null;
}): React.ReactElement {
  useCancelInput(onCancel);
  const reopenLink = authUrl ? formatTerminalHyperlink(authUrl, 'Open authentication URL') : null;

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
          <Text> Authenticating with Firebase...</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>A browser window will open for authentication</Text>
        </Box>
        {reopenLink ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>If browser was closed, reopen this URL:</Text>
            <Text color="cyan">{reopenLink}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>Esc/Ctrl+C to cancel</Text>
        </Box>
      </Box>
      {authUrl ? (
        <Box marginLeft={2} marginTop={1} flexDirection="column">
          <Text dimColor>Direct URL:</Text>
          <Text>{authUrl}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function FirebaseProjectsPhase({
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
    value: project.projectId,
  }));

  const handleSelect = useCallback(
    (item: { label: string; value: string }) => {
      const project = projects.find((candidate) => candidate.projectId === item.value);
      if (project) {
        onSelect(project);
      }
    },
    [onSelect, projects],
  );

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
      <Box marginBottom={1}>
        <Text dimColor>Choose the project to upload APNS key:</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text dimColor>Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

type FirebaseProjectTaskPhase = 'authenticating' | 'select_project' | 'error';

type ProjectSelectionDecision =
  | { type: 'complete'; project: FirebaseProject }
  | { type: 'select' }
  | { type: 'error'; message: string };

function decideProjectSelection(
  projects: FirebaseProject[],
  preferredProjectId: string | null,
): ProjectSelectionDecision {
  if (preferredProjectId) {
    const matchingProject = projects.find((project) => project.projectId === preferredProjectId);
    if (matchingProject) {
      return { type: 'complete', project: matchingProject };
    }
  }

  if (projects.length === 1) {
    return { type: 'complete', project: projects[0] };
  }

  if (projects.length === 0) {
    return { type: 'error', message: 'No Firebase projects found' };
  }

  return { type: 'select' };
}

export const FirebaseProjectSelectionTask: React.FC<{
  preferredProjectId: string | null;
  onComplete: (project: FirebaseProject | null) => void;
  onCancel: () => void;
}> = ({ preferredProjectId, onComplete, onCancel }) => {
  const [phase, setPhase] = useState<FirebaseProjectTaskPhase>('authenticating');
  const [projects, setProjects] = useState<FirebaseProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const downloaderRef = useRef<FirebaseDownloader | null>(null);
  const cancelAuthentication = useCallback(() => {
    downloaderRef.current?.cancelAuthentication('Firebase project selection cancelled');
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    if (phase !== 'authenticating') {
      return;
    }

    let cancelled = false;

    const authenticateAndSelect = async () => {
      try {
        setAuthUrl(null);
        downloaderRef.current = downloaderRef.current ?? new FirebaseDownloader();
        const downloader = downloaderRef.current;
        const authResult = await downloader.authenticate((url) => {
          if (cancelled) {
            return;
          }
          setAuthUrl(url);
          void openBrowser(url);
        });
        if (!authResult.success) {
          throw new Error(authResult.error || 'Firebase authentication failed');
        }

        const fetchedProjects = await downloader.listProjects();
        if (cancelled) {
          return;
        }

        setProjects(fetchedProjects);
        const decision = decideProjectSelection(fetchedProjects, preferredProjectId);
        if (decision.type === 'complete') {
          onComplete(decision.project);
          return;
        }
        if (decision.type === 'error') {
          setError(decision.message);
          setPhase('error');
          return;
        }
        setPhase('select_project');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Firebase authentication failed');
        setPhase('error');
      }
    };

    void authenticateAndSelect();

    return () => {
      cancelled = true;
      downloaderRef.current?.cancelAuthentication('Firebase project selection cancelled');
    };
  }, [onComplete, phase, preferredProjectId]);

  if (phase === 'authenticating') {
    return <FirebaseAuthPhase authUrl={authUrl} onCancel={cancelAuthentication} />;
  }

  if (phase === 'select_project') {
    return (
      <FirebaseProjectsPhase
        projects={projects}
        onSelect={(project) => onComplete(project)}
        onCancel={cancelAuthentication}
      />
    );
  }

  return (
    <ErrorPhase
      error={error || 'Unknown Firebase project selection error'}
      onRetry={() => {
        setError(null);
        setAuthUrl(null);
        setPhase('authenticating');
      }}
      onCancel={cancelAuthentication}
    />
  );
};

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

  const projectLabel =
    selectedProject?.displayName ||
    selectedProject?.projectId ||
    context.firebaseProjectId ||
    'Unknown';

  useEffect(() => {
    if (!browserOpened) {
      const projectId = selectedProject?.projectId ?? context.firebaseProjectId;
      const url = projectId
        ? PUSH_SETUP_URLS.firebaseConsole(projectId)
        : PUSH_SETUP_URLS.firebaseConsoleGeneric;
      openBrowser(url);
      setBrowserOpened(true);
    }
  }, [browserOpened, context.firebaseProjectId, selectedProject]);

  useInput((_input, key) => {
    if (key.return) {
      onComplete();
    }
  });

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
        <Text bold>Upload APNS Key to Firebase</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Project: <Text color="cyan">{projectLabel}</Text>
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
        {FIREBASE_UPLOAD_STEPS.map((step, index) => (
          <Text key={`${index + 1}-${step}`} dimColor>
            {index + 1}. {step}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">Press Enter when upload is complete</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

export const FirebaseApnsRegistrationTask: React.FC<{
  context: PushSetupContext;
  selectedProject: FirebaseProject | null;
  onComplete: () => void;
  onCancel: () => void;
}> = ({ context, selectedProject, onComplete, onCancel }) => {
  return (
    <FirebaseUploadPhase
      context={context}
      selectedProject={selectedProject}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
};
