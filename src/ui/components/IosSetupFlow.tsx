/**
 * Integrated iOS Setup Flow for Interactive mode.
 * Combines Phase 1 (IosSetupUI), Phase 2 (GuidedSetupWizard), and Phase 3 (PushSetupWizard).
 */
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { PushSetupResult } from '../../lib/push';
import { type IosSetupResult, IosSetupUI } from '../IosSetupUI';
import {
  type GuidedSetupContext,
  type GuidedSetupResult,
  GuidedSetupWizard,
} from './GuidedSetupWizard';
import { PushSetupWizard } from './PushSetupWizard';

type FlowPhase =
  | 'intro' // Welcome screen
  | 'direct_setup' // Phase 1: IosSetupUI
  | 'guided_setup' // Phase 2: GuidedSetupWizard
  | 'push_confirm' // Confirm push setup
  | 'push_setup' // Phase 3: PushSetupWizard
  | 'complete'; // All done

export interface IosSetupFlowResult {
  success: boolean;
  message: string;
  directResult?: IosSetupResult;
  guidedResult?: GuidedSetupResult;
  pushResult?: PushSetupResult | null;
}

interface IosSetupFlowProps {
  onComplete: (result: IosSetupFlowResult) => void;
}

/**
 * Intro screen component
 */
const IntroScreen: React.FC<{
  onContinue: () => void;
  onCancel: () => void;
}> = ({ onContinue, onCancel }) => {
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
        <Text bold>iOS Push Notification Setup</Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>This wizard will configure your iOS app for push notifications:</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} marginBottom={1}>
        <Text dimColor>1. Configure entitlements and capabilities</Text>
        <Text dimColor>2. Create Notification Service Extension files</Text>
        <Text dimColor>3. Set up APNS key for Firebase (optional)</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">Press Enter to continue, Esc to cancel</Text>
      </Box>
    </Box>
  );
};

/**
 * Push setup confirmation component
 */
const PushSetupConfirmation: React.FC<{
  onYes: () => void;
  onNo: () => void;
}> = ({ onYes, onNo }) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y' || key.return) {
      onYes();
    } else if (input.toLowerCase() === 'n' || key.escape) {
      onNo();
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>
        ✓ iOS setup completed!
      </Text>
      <Box marginTop={1}>
        <Text>
          Set up APNS key for Firebase push notifications? <Text dimColor>[Y/n]</Text>
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Integrated iOS Setup Flow component
 */
export const IosSetupFlow: React.FC<IosSetupFlowProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<FlowPhase>('intro');
  const [directResult, setDirectResult] = useState<IosSetupResult | null>(null);
  const [guidedResult, setGuidedResult] = useState<GuidedSetupResult | null>(null);

  // Intro handlers
  const handleIntroContinue = useCallback(() => {
    setPhase('direct_setup');
  }, []);

  const handleIntroCancel = useCallback(() => {
    onComplete({
      success: false,
      message: 'iOS setup cancelled',
    });
  }, [onComplete]);

  // Phase 1 complete handler
  const handleDirectSetupComplete = useCallback(
    (result: IosSetupResult) => {
      setDirectResult(result);

      if (!result.success) {
        onComplete({
          success: false,
          message: result.error || 'iOS setup failed',
          directResult: result,
        });
        return;
      }

      // If there's agent context, proceed to guided setup
      if (result.agentContext) {
        setPhase('guided_setup');
      } else {
        // No extension needed, go to push confirmation
        setPhase('push_confirm');
      }
    },
    [onComplete],
  );

  // Phase 2 complete handler
  const handleGuidedSetupComplete = useCallback((result: GuidedSetupResult) => {
    setGuidedResult(result);
    // Always proceed to push confirmation (even if guided setup had issues)
    setPhase('push_confirm');
  }, []);

  // Push confirmation handlers
  const handlePushConfirmYes = useCallback(() => {
    setPhase('push_setup');
  }, []);

  const handlePushConfirmNo = useCallback(() => {
    // Complete without push setup
    const message = buildCompletionMessage(directResult, guidedResult, null);
    onComplete({
      success: true,
      message,
      directResult: directResult ?? undefined,
      guidedResult: guidedResult ?? undefined,
      pushResult: null,
    });
  }, [directResult, guidedResult, onComplete]);

  // Phase 3 complete handler
  const handlePushSetupComplete = useCallback(
    (result: PushSetupResult) => {
      const message = buildCompletionMessage(directResult, guidedResult, result);
      onComplete({
        success: true,
        message,
        directResult: directResult ?? undefined,
        guidedResult: guidedResult ?? undefined,
        pushResult: result,
      });
    },
    [directResult, guidedResult, onComplete],
  );

  // Push setup cancel handler
  const handlePushSetupCancel = useCallback(() => {
    const message = buildCompletionMessage(directResult, guidedResult, null);
    onComplete({
      success: true,
      message,
      directResult: directResult ?? undefined,
      guidedResult: guidedResult ?? undefined,
      pushResult: null,
    });
  }, [directResult, guidedResult, onComplete]);

  // Build guided setup context from direct result
  const getGuidedSetupContext = (): GuidedSetupContext | null => {
    if (!directResult?.agentContext) return null;
    return {
      bundleId: directResult.agentContext.bundleId,
      appGroupId: directResult.agentContext.appGroupId,
      appName: directResult.agentContext.appName,
      iosDir: directResult.agentContext.iosDir,
      entitlementsPath: directResult.agentContext.entitlementsPath,
    };
  };

  // Handle edge case where guided_setup has no context (avoid setState during render)
  useEffect(() => {
    if (phase === 'guided_setup' && !directResult?.agentContext) {
      setPhase('push_confirm');
    }
  }, [phase, directResult?.agentContext]);

  // Render based on current phase
  switch (phase) {
    case 'intro':
      return <IntroScreen onContinue={handleIntroContinue} onCancel={handleIntroCancel} />;

    case 'direct_setup':
      return <IosSetupUI options={{ skipPortal: true }} onComplete={handleDirectSetupComplete} />;

    case 'guided_setup': {
      const context = getGuidedSetupContext();
      if (!context) {
        // Will be handled by useEffect above
        return null;
      }
      return <GuidedSetupWizard context={context} onComplete={handleGuidedSetupComplete} />;
    }

    case 'push_confirm':
      return <PushSetupConfirmation onYes={handlePushConfirmYes} onNo={handlePushConfirmNo} />;

    case 'push_setup':
      return (
        <PushSetupWizard
          projectPath={process.cwd()}
          preDetectedBundleId={directResult?.bundleId}
          preDetectedFirebaseProjectId={directResult?.firebaseProjectId}
          preDetectedTeamId={directResult?.teamId}
          onComplete={handlePushSetupComplete}
          onCancel={handlePushSetupCancel}
        />
      );

    case 'complete':
      return null;

    default:
      return null;
  }
};

/**
 * Build completion message summarizing all phases
 */
function buildCompletionMessage(
  directResult: IosSetupResult | null,
  guidedResult: GuidedSetupResult | null,
  pushResult: PushSetupResult | null,
): string {
  const lines: string[] = ['iOS Push Setup Complete!', ''];

  if (directResult?.success) {
    lines.push('✓ Capabilities configured');
    lines.push('✓ Entitlements created');
  }

  if (guidedResult?.success) {
    lines.push('✓ Extension files created');
  }

  if (pushResult?.success) {
    lines.push('✓ APNS key registered with Firebase');
  } else if (pushResult === null) {
    lines.push('○ APNS key setup skipped');
  }

  lines.push('');
  lines.push('Your iOS app is ready to receive push notifications!');

  return lines.join('\n');
}
