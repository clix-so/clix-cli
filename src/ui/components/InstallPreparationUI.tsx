/**
 * Install preparation UI component.
 *
 * Orchestrates the preparation steps before SDK installation:
 * 1. Check project config
 * 2. Firebase setup (if needed)
 * 3. iOS setup (if needed)
 * 4. Ready for agent execution
 *
 * @module ui/components/InstallPreparationUI
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { FirebaseSetupResult } from '@/lib/services/firebase';
import { formatProjectType } from '@/lib/services/project-detector';
import { useCancelInput } from '@/ui/hooks';
import {
  type FirebaseStatus,
  gatherPreparationContext,
  type PreparationContext,
  saveSetupStatus,
} from '../../commands/skill/preparation';
import { FirebaseWizard } from './FirebaseWizard';
import { GenericSelector, type SelectorItem } from './GenericSelector';

type PreparationPhase =
  | 'checking'
  | 'config_missing'
  | 'firebase_check'
  | 'firebase_setup'
  | 'ios_check'
  | 'ios_setup'
  | 'ready'
  | 'cancelled';

interface InstallPreparationUIProps {
  projectPath?: string;
  onComplete: (context: PreparationContext) => void;
  onCancel: () => void;
}

interface ActionItem extends SelectorItem {
  action: 'configure' | 'skip' | 'cancel';
}

function StatusLine({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'pending' | 'checking' | 'ok' | 'missing' | 'skipped';
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
  onContinue,
  onCancel,
}: {
  context: PreparationContext;
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const items: ActionItem[] = [
    {
      id: 'continue',
      label: context.ready ? 'Continue to installation' : 'Continue anyway (some setup missing)',
      action: 'configure',
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
    <Box flexDirection="column" marginY={1}>
      <Text bold>Install Preparation</Text>
      <Box marginY={1} flexDirection="column">
        <StatusLine label="Project linked" status="ok" detail={context.config.project.name} />
        <StatusLine
          label="Project type"
          status={context.projectType.framework !== 'unknown' ? 'ok' : 'missing'}
          detail={formatProjectType(context.projectType)}
        />
        {context.firebase.needed && (
          <StatusLine
            label="Firebase"
            status={context.firebase.configured ? 'ok' : 'missing'}
            detail={
              context.firebase.configured
                ? context.firebase.projectId || 'configured'
                : 'not configured'
            }
          />
        )}
        {context.ios.needed && (
          <>
            <StatusLine
              label="iOS Entitlements"
              status={context.ios.entitlementsConfigured ? 'ok' : 'missing'}
            />
            <StatusLine
              label="Notification Service Extension"
              status={context.ios.nseConfigured ? 'ok' : 'missing'}
            />
          </>
        )}
      </Box>

      {context.missing.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow">Missing setup:</Text>
          {context.missing.map((item) => (
            <Text key={item} color="gray">
              • {item}
            </Text>
          ))}
        </Box>
      )}

      <GenericSelector items={items} title="" onSelect={handleSelect} onCancel={onCancel} />
    </Box>
  );
}

function FirebaseSetupPhase({
  context,
  onComplete,
  onCancel,
}: {
  context: PreparationContext;
  onComplete: (result: FirebaseSetupResult) => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Firebase Setup</Text>
      <Box marginBottom={1}>
        <Text color="gray">Firebase configuration is required for push notifications.</Text>
      </Box>
      <FirebaseWizard
        projectPath={context.projectPath}
        projectType={context.projectType}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    </Box>
  );
}

function ReadyPhase({
  context,
  onContinue,
  onCancel,
}: {
  context: PreparationContext;
  onContinue: () => void;
  onCancel: () => void;
}): React.ReactElement {
  useCancelInput(onCancel);

  useEffect(() => {
    // Auto-continue after a brief moment
    const timer = setTimeout(onContinue, 500);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>
        ✓ Preparation complete
      </Text>
      <Box marginY={1} flexDirection="column">
        <Text>Project: {context.config.project.name}</Text>
        <Text>Type: {formatProjectType(context.projectType)}</Text>
        {context.firebase.projectId && <Text>Firebase: {context.firebase.projectId}</Text>}
      </Box>
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Starting SDK installation...</Text>
      </Box>
    </Box>
  );
}

/**
 * Install preparation UI component.
 *
 * Guides user through setup steps before SDK installation.
 */
export function InstallPreparationUI({
  projectPath = process.cwd(),
  onComplete,
  onCancel,
}: InstallPreparationUIProps): React.ReactElement {
  const [phase, setPhase] = useState<PreparationPhase>('checking');
  const [context, setContext] = useState<PreparationContext | null>(null);

  // Gather preparation context on mount
  useEffect(() => {
    let mounted = true;

    async function check() {
      const ctx = await gatherPreparationContext(projectPath);

      if (!mounted) return;

      if (!ctx) {
        setPhase('config_missing');
        return;
      }

      setContext(ctx);

      // Determine which setup phase to show
      if (!ctx.firebase.configured && ctx.firebase.needed) {
        setPhase('firebase_check');
      } else if (!ctx.ios.entitlementsConfigured && ctx.ios.needed) {
        setPhase('ios_check');
      } else if (ctx.ready) {
        setPhase('ready');
      } else {
        // Some setup missing but not critical - show status
        setPhase('firebase_check');
      }
    }

    check();

    return () => {
      mounted = false;
    };
  }, [projectPath]);

  const handleFirebaseComplete = useCallback(
    async (result: FirebaseSetupResult) => {
      if (!context) return;

      // Extract status from detection result
      const detection = result.detection;
      const androidConfigured = detection?.android?.valid ?? context.firebase.androidConfigured;
      const iosConfigured = detection?.ios?.valid ?? context.firebase.iosConfigured;

      // Extract project ID from detection
      let projectId = context.firebase.projectId;
      if (detection?.android?.content && 'project_info' in detection.android.content) {
        projectId = detection.android.content.project_info?.project_id;
      } else if (detection?.ios?.content && 'PROJECT_ID' in detection.ios.content) {
        projectId = detection.ios.content.PROJECT_ID;
      }

      // Update Firebase status based on result
      const updatedFirebase: FirebaseStatus = {
        ...context.firebase,
        configured: result.completed && androidConfigured && iosConfigured,
        androidConfigured,
        iosConfigured,
        projectId,
      };

      const updatedContext: PreparationContext = {
        ...context,
        firebase: updatedFirebase,
        missing: context.missing.filter((m) => !m.includes('Firebase')),
        ready:
          updatedFirebase.configured &&
          (!context.ios.needed ||
            (context.ios.entitlementsConfigured && context.ios.nseConfigured)),
      };

      setContext(updatedContext);

      // Save setup status
      await saveSetupStatus(projectPath, updatedFirebase, context.ios);

      // Move to next phase
      if (context.ios.needed && !context.ios.entitlementsConfigured) {
        setPhase('ios_check');
      } else {
        setPhase('ready');
      }
    },
    [context, projectPath],
  );

  const handleIosSkip = useCallback(() => {
    setPhase('ready');
  }, []);

  const handleContinue = useCallback(() => {
    if (!context) return;

    if (phase === 'firebase_check') {
      if (!context.firebase.configured && context.firebase.needed) {
        setPhase('firebase_setup');
      } else if (context.ios.needed && !context.ios.entitlementsConfigured) {
        setPhase('ios_check');
      } else {
        setPhase('ready');
      }
    } else if (phase === 'ios_check') {
      if (!context.ios.entitlementsConfigured && context.ios.needed) {
        setPhase('ios_setup');
      } else {
        setPhase('ready');
      }
    } else if (phase === 'ready') {
      onComplete(context);
    }
  }, [context, phase, onComplete]);

  const handleCancel = useCallback(() => {
    setPhase('cancelled');
    onCancel();
  }, [onCancel]);

  // Render based on phase
  switch (phase) {
    case 'checking':
      return <CheckingPhase />;

    case 'config_missing':
      return <ConfigMissingPhase onCancel={handleCancel} />;

    case 'firebase_check':
      if (!context) return <CheckingPhase />;
      return <StatusPhase context={context} onContinue={handleContinue} onCancel={handleCancel} />;

    case 'firebase_setup':
      if (!context) return <CheckingPhase />;
      return (
        <FirebaseSetupPhase
          context={context}
          onComplete={handleFirebaseComplete}
          onCancel={handleCancel}
        />
      );

    case 'ios_check':
      if (!context) return <CheckingPhase />;
      return <StatusPhase context={context} onContinue={handleContinue} onCancel={handleCancel} />;

    case 'ios_setup':
      // For now, skip iOS setup wizard (complex integration)
      // The agent will handle iOS setup if needed
      if (!context) return <CheckingPhase />;
      handleIosSkip();
      return <CheckingPhase />;

    case 'ready':
      if (!context) return <CheckingPhase />;
      return (
        <ReadyPhase
          context={context}
          onContinue={() => onComplete(context)}
          onCancel={handleCancel}
        />
      );

    case 'cancelled':
      return (
        <Box marginY={1}>
          <Text color="yellow">Installation cancelled.</Text>
        </Box>
      );

    default:
      return <CheckingPhase />;
  }
}
