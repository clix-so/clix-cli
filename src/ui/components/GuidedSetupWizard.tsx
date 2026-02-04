/**
 * Guided Setup Wizard - Replaces AI Agent for Xcode configuration
 * Provides step-by-step guidance for manual Xcode tasks
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  createExtensionFiles,
  type ExtensionContext,
  type ExtensionGeneratorResult,
  getExtensionBundleId,
  getExtensionName,
  verifyExtensionFiles,
} from '@/lib/ios/extension-generator';
import { generatePodfileSnippet } from '@/lib/ios/extension-templates';
import { isCtrlCInput } from '@/ui/hooks';
import { Header } from './Header';
import { StatusMessage } from './StatusMessage';

export type GuidedSetupPhase =
  | 'creating_files'
  | 'xcode_target'
  | 'build_settings'
  | 'dependencies'
  | 'verification'
  | 'complete';

export interface GuidedSetupContext {
  bundleId: string;
  appGroupId: string;
  appName: string;
  iosDir: string;
  entitlementsPath: string;
  pushEnvironment?: 'development' | 'production';
}

export interface GuidedSetupResult {
  success: boolean;
  extensionCreated: boolean;
  extensionDir?: string;
  createdFiles: string[];
  error?: string;
}

interface GuidedSetupWizardProps {
  context: GuidedSetupContext;
  onComplete: (result: GuidedSetupResult) => void;
}

interface WizardState {
  phase: GuidedSetupPhase;
  extensionResult: ExtensionGeneratorResult | null;
  error: string | null;
}

export const GuidedSetupWizard: React.FC<GuidedSetupWizardProps> = ({ context, onComplete }) => {
  const [state, setState] = useState<WizardState>({
    phase: 'creating_files',
    extensionResult: null,
    error: null,
  });

  const { phase, extensionResult, error } = state;
  const extensionName = getExtensionName(context.appName);
  const extensionBundleId = getExtensionBundleId(context.bundleId, context.appName);

  // Create extension files on mount
  useEffect(() => {
    if (phase !== 'creating_files') return;

    const create = async () => {
      const extContext: ExtensionContext = {
        appName: context.appName,
        bundleId: context.bundleId,
        iosDir: context.iosDir,
        pushEnvironment: context.pushEnvironment,
      };

      const result = await createExtensionFiles(extContext);

      if (!result.success) {
        setState((s) => ({
          ...s,
          phase: 'complete',
          extensionResult: result,
          error: result.error || 'Failed to create extension files',
        }));
        return;
      }

      setState((s) => ({
        ...s,
        phase: 'xcode_target',
        extensionResult: result,
      }));
    };

    create();
  }, [phase, context]);

  // Handle keyboard input for navigation
  useInput((input, key) => {
    if (key.return || input === ' ') {
      switch (phase) {
        case 'xcode_target':
          setState((s) => ({ ...s, phase: 'build_settings' }));
          break;
        case 'build_settings':
          setState((s) => ({ ...s, phase: 'dependencies' }));
          break;
        case 'dependencies':
          setState((s) => ({ ...s, phase: 'verification' }));
          break;
        case 'verification':
          setState((s) => ({ ...s, phase: 'complete' }));
          break;
      }
    }

    const shouldCancel = key.escape || isCtrlCInput(input, key);
    if (shouldCancel && phase !== 'creating_files' && phase !== 'complete') {
      setState((s) => ({ ...s, phase: 'complete' }));
    }
  });

  // Complete handler
  useEffect(() => {
    if (phase === 'complete') {
      const verification = verifyExtensionFiles(context.iosDir, context.appName);

      setTimeout(() => {
        onComplete({
          success: !error && verification.complete,
          extensionCreated: !!extensionResult?.createdFiles.length,
          extensionDir: extensionResult?.extensionDir,
          createdFiles: extensionResult?.createdFiles || [],
          error: error || undefined,
        });
      }, 500);
    }
  }, [phase, error, extensionResult, context, onComplete]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="iOS Setup - Extension Configuration" />

      {/* Phase: Creating Files */}
      {phase === 'creating_files' && (
        <StatusMessage type="loading" message="Creating Notification Service Extension files..." />
      )}

      {/* Phase: Xcode Target Guide */}
      {phase === 'xcode_target' && (
        <XcodeTargetGuide
          extensionName={extensionName}
          extensionBundleId={extensionBundleId}
          extensionResult={extensionResult}
          appGroupId={context.appGroupId}
        />
      )}

      {/* Phase: Build Settings Guide */}
      {phase === 'build_settings' && (
        <BuildSettingsGuide
          extensionName={extensionName}
          entitlementsPath={context.entitlementsPath}
        />
      )}

      {/* Phase: Dependencies Guide */}
      {phase === 'dependencies' && <DependenciesGuide extensionName={extensionName} />}

      {/* Phase: Verification */}
      {phase === 'verification' && (
        <VerificationPhase context={context} extensionResult={extensionResult} />
      )}

      {/* Phase: Complete */}
      {phase === 'complete' && <CompletePhase error={error} extensionResult={extensionResult} />}
    </Box>
  );
};

// Sub-components for each phase

const XcodeTargetGuide: React.FC<{
  extensionName: string;
  extensionBundleId: string;
  extensionResult: ExtensionGeneratorResult | null;
  appGroupId: string;
}> = ({ extensionName, extensionBundleId, extensionResult, appGroupId }) => (
  <Box flexDirection="column">
    {extensionResult && extensionResult.createdFiles.length > 0 && (
      <Box flexDirection="column" marginBottom={1}>
        <StatusMessage type="success" message="Extension files created" />
        {extensionResult.createdFiles.map((file) => (
          <Box key={file} marginLeft={2}>
            <Text dimColor>• {file}</Text>
          </Box>
        ))}
      </Box>
    )}

    <Box marginBottom={1}>
      <Text bold color="cyan">
        Step 1: Create Notification Service Extension Target in Xcode
      </Text>
    </Box>

    <Box flexDirection="column" marginLeft={2}>
      <Text>1. Open your project in Xcode</Text>
      <Text>2. File → New → Target...</Text>
      <Text>3. Select "Notification Service Extension"</Text>
      <Text>
        4. Product Name: <Text color="yellow">{extensionName}</Text>
      </Text>
      <Text>
        5. Bundle Identifier: <Text color="yellow">{extensionBundleId}</Text>
      </Text>
      <Text>6. Click "Finish"</Text>
    </Box>

    <Box marginTop={1} flexDirection="column" marginLeft={2}>
      <Text dimColor>After creating the target:</Text>
      <Text dimColor>• Delete the auto-generated NotificationService.swift</Text>
      <Text dimColor>• Copy files from the created extension directory</Text>
      <Text dimColor>
        • Add App Group capability: <Text color="yellow">{appGroupId}</Text>
      </Text>
    </Box>

    <Box marginTop={1}>
      <Text dimColor>Press Enter to continue...</Text>
    </Box>
  </Box>
);

const BuildSettingsGuide: React.FC<{
  extensionName: string;
  entitlementsPath: string;
}> = ({ extensionName, entitlementsPath }) => (
  <Box flexDirection="column">
    <StatusMessage type="success" message="Target creation guide complete" />

    <Box marginTop={1} marginBottom={1}>
      <Text bold color="cyan">
        Step 2: Configure Build Settings
      </Text>
    </Box>

    <Box flexDirection="column" marginLeft={2}>
      <Text bold>For the main app target:</Text>
      <Text>1. Select target → Signing & Capabilities</Text>
      <Text>2. Verify entitlements file is linked:</Text>
      <Box marginLeft={2}>
        <Text color="yellow">{entitlementsPath}</Text>
      </Box>
    </Box>

    <Box marginTop={1} flexDirection="column" marginLeft={2}>
      <Text bold>For {extensionName}:</Text>
      <Text>1. Select extension target → Build Settings</Text>
      <Text>
        2. Search for <Text color="yellow">ENABLE_USER_SCRIPT_SANDBOXING</Text>
      </Text>
      <Text>
        3. Set to <Text color="green">No</Text> (required for Xcode 15+)
      </Text>
    </Box>

    <Box marginTop={1} flexDirection="column" marginLeft={2}>
      <Text bold dimColor>
        For React Native + Firebase projects:
      </Text>
      <Text dimColor>• Build Phases → Move "Embed Foundation Extensions"</Text>
      <Text dimColor> above "[RNFB] Core Configuration"</Text>
    </Box>

    <Box marginTop={1}>
      <Text dimColor>Press Enter to continue...</Text>
    </Box>
  </Box>
);

const DependenciesGuide: React.FC<{
  extensionName: string;
}> = ({ extensionName }) => {
  const podfileSnippet = generatePodfileSnippet(extensionName);

  return (
    <Box flexDirection="column">
      <StatusMessage type="success" message="Build settings guide complete" />

      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">
          Step 3: Add Clix SDK to Extension Target
        </Text>
      </Box>

      <Box flexDirection="column" marginLeft={2}>
        <Text bold>For CocoaPods projects:</Text>
        <Text>Add to your Podfile:</Text>
        <Box marginY={1} paddingX={2} borderStyle="round" borderColor="gray">
          <Text color="yellow">{podfileSnippet}</Text>
        </Box>
        <Text>
          Then run: <Text color="cyan">cd ios && pod install</Text>
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text bold>For Swift Package Manager:</Text>
        <Text>1. Select the extension target in Xcode</Text>
        <Text>2. General → Frameworks, Libraries, and Embedded Content</Text>
        <Text>3. Click + and add the Clix package</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to continue...</Text>
      </Box>
    </Box>
  );
};

const VerificationPhase: React.FC<{
  context: GuidedSetupContext;
  extensionResult: ExtensionGeneratorResult | null;
}> = ({ context, extensionResult }) => {
  const verification = verifyExtensionFiles(context.iosDir, context.appName);

  return (
    <Box flexDirection="column">
      <StatusMessage type="success" message="Dependency guide complete" />

      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">
          Step 4: Verification
        </Text>
      </Box>

      <Box flexDirection="column" marginLeft={2}>
        <Text bold>Extension Files:</Text>
        {verification.complete ? (
          <StatusMessage type="success" message="All extension files created" />
        ) : (
          <Box flexDirection="column">
            <StatusMessage type="warning" message="Missing files:" />
            {verification.missingFiles.map((file) => (
              <Box key={file} marginLeft={2}>
                <Text color="red">• {file}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text bold>Extension Directory:</Text>
        <Text dimColor>{extensionResult?.extensionDir}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text bold>Important Reminders:</Text>
        <Text dimColor>
          • Replace <Text color="yellow">YOUR_PROJECT_ID</Text> in NotificationService.swift
        </Text>
        <Text dimColor>• Extension must share the same App Group as main app</Text>
        <Text dimColor>• Regenerate provisioning profiles if needed</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to finish...</Text>
      </Box>
    </Box>
  );
};

const CompletePhase: React.FC<{
  error: string | null;
  extensionResult: ExtensionGeneratorResult | null;
}> = ({ error, extensionResult }) => (
  <Box flexDirection="column">
    {error ? (
      <StatusMessage type="error" message={error} />
    ) : (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="green">
            ✓ Extension setup guide complete!
          </Text>
        </Box>
        {extensionResult && extensionResult.createdFiles.length > 0 && (
          <Box flexDirection="column" marginLeft={2}>
            <Text>Created files:</Text>
            {extensionResult.createdFiles.map((file) => (
              <Text key={file} dimColor>
                • {file}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )}
  </Box>
);
