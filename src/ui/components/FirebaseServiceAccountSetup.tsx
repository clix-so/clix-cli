import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { openBrowser } from '@/lib/auth/browser';
import {
  parseServiceAccountJson,
  type ServiceAccountJson,
  type ServiceAccountValidationResult,
} from '@/lib/services/firebase';
import { useCancelInput } from '@/ui/hooks';
import { readTextFileFromInputPath } from './file-input-utils';

export { hasValidFirebaseConfigFiles } from './firebase-detection-utils';

async function readClipboard(): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('pbpaste', []);
      return stdout;
    }

    if (process.platform === 'linux') {
      try {
        const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-o']);
        return stdout;
      } catch {
        const { stdout } = await execFileAsync('xsel', ['--clipboard', '--output']);
        return stdout;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export {
  CheckingSenderConfigPhase as FirebaseServiceAccountCheckingSenderConfigTask,
  DetectingPhase as FirebaseServiceAccountDetectingTask,
  ErrorPhase as FirebaseServiceAccountErrorTask,
  PasteServiceAccountPhase as FirebaseServiceAccountPasteTask,
  RegistrationFailedPhase as FirebaseServiceAccountRegistrationFailedTask,
  RegisteringSenderConfigPhase as FirebaseServiceAccountRegisteringTask,
  SavingServiceAccountPhase as FirebaseServiceAccountSavingTask,
  SenderConfigRegisteredPhase as FirebaseServiceAccountRegisteredTask,
};

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
        <Text bold>Firebase Service Account</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Detecting Firebase configuration files...</Text>
      </Box>
    </Box>
  );
}

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
        <Text bold>Firebase Service Account</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Checking existing sender config...</Text>
      </Box>
    </Box>
  );
}

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
        <Text bold>Firebase Service Account</Text>
      </Box>
      <Text color="green">✓ Firebase Service Account is already registered</Text>
      <Text dimColor>Configured at: {formattedDate}</Text>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to continue, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

function PasteServiceAccountPhase({
  projectId,
  onSubmit,
  onCancel,
}: {
  projectId: string;
  onSubmit: (json: ServiceAccountJson) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [input, setInput] = useState('');
  const [validation, setValidation] = useState<ServiceAccountValidationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [browserOpened, setBrowserOpened] = useState(false);
  const serviceAccountConsoleUrl = `https://console.firebase.google.com/project/${projectId}/settings/serviceaccounts/adminsdk`;

  useCancelInput(onCancel);

  useEffect(() => {
    if (browserOpened) {
      return;
    }

    void openBrowser(serviceAccountConsoleUrl);
    setBrowserOpened(true);
  }, [browserOpened, serviceAccountConsoleUrl]);

  const processJson = useCallback(
    (content: string, source: string) => {
      const parsed = parseServiceAccountJson(content);
      setValidation(parsed);

      if (!parsed.valid || !parsed.data) {
        setErrorMsg(`Invalid Service Account JSON (from ${source})`);
        return;
      }

      onSubmit(parsed.data);
    },
    [onSubmit],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    setErrorMsg(null);
    setValidation(null);
    setLoading(true);

    try {
      if (!trimmed) {
        setLoadingText('Reading from clipboard...');
        const clipboard = await readClipboard();
        if (!clipboard?.trim()) {
          setErrorMsg('Clipboard is empty. Copy the JSON content first.');
          return;
        }

        processJson(clipboard, 'clipboard');
        return;
      }

      if (trimmed.startsWith('{')) {
        processJson(trimmed, 'input');
        return;
      }

      setLoadingText('Reading file...');
      const fileContent = await readTextFileFromInputPath(trimmed);
      processJson(fileContent, 'file');
    } catch (err) {
      const errorCode = (err as NodeJS.ErrnoException).code;
      if (errorCode === 'ENOENT') {
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
        <Text bold>Firebase Service Account Setup</Text>
      </Box>
      <Text>Project: {projectId}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>1. Open Firebase Console and generate a new private key JSON:</Text>
        <Text color="blue">{serviceAccountConsoleUrl}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>2. Copy JSON to clipboard and press Enter, or drag the JSON file here.</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="blue">{'>'} </Text>
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
        <Box marginTop={1} flexDirection="column">
          <Text color="red">Validation errors:</Text>
          {validation.errors.map((validationError) => (
            <Text key={validationError} color="red">
              • {validationError}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to import · Esc/Ctrl+C cancel</Text>
      </Box>
    </Box>
  );
}

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

function RegisteringSenderConfigPhase(): React.ReactElement {
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
        <Text bold>Firebase Service Account</Text>
      </Box>
      <Box>
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
        <Text> Registering sender config...</Text>
      </Box>
    </Box>
  );
}

function RegistrationFailedPhase({
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
    }
  });

  useCancelInput(onCancel);

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
        <Text bold>Firebase Service Account</Text>
      </Box>
      <Text color="yellow">✗ Failed to register sender config</Text>
      <Text dimColor>Reason: {error}</Text>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to retry, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}

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
          Firebase Service Account Error
        </Text>
      </Box>
      <Text color="red">✗ {error}</Text>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to retry, Esc/Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}
