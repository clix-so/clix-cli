import { Box, render, Text, useInput } from 'ink';
import type React from 'react';
import type { PushSetupResult } from '../../lib/push';
import {
  type GuidedSetupContext,
  type GuidedSetupResult,
  GuidedSetupWizard,
} from '../../ui/components/GuidedSetupWizard';
import { PushSetupWizard } from '../../ui/components/PushSetupWizard';
import { type IosSetupOptions, type IosSetupResult, IosSetupUI } from '../../ui/IosSetupUI';
import { type FinalOutputResult, printFinalOutput } from '../../ui/utils/finalOutput';

export interface IosSetupCommandOptions {
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

function toDirectSetupOutput(result: IosSetupResult): FinalOutputResult {
  if (result.success) {
    const details: string[] = [];

    if (result.projectInfo) {
      details.push(`Project: ${result.projectInfo.appName}`);
      details.push(`Bundle ID: ${result.projectInfo.bundleId}`);
    }

    if (result.portalSync) {
      if (result.portalSync.enabled.length > 0) {
        details.push(`Enabled: ${result.portalSync.enabled.join(', ')}`);
      }
      if (result.portalSync.appGroupCreated && result.portalSync.appGroupId) {
        details.push(`Created App Group: ${result.portalSync.appGroupId}`);
      }
    }

    if (result.entitlementsUpdated.length > 0) {
      details.push(`Updated files: ${result.entitlementsUpdated.length}`);
    }

    return {
      type: 'success',
      title: 'Direct setup completed',
      message: result.agentContext
        ? 'Portal sync and entitlements configured. Proceeding to extension setup...'
        : 'Portal sync and entitlements configured.',
      details: details.length > 0 ? details : undefined,
    };
  }

  return {
    type: 'error',
    title: 'iOS setup failed',
    message: result.error || 'Unknown error occurred',
  };
}

/**
 * Run the direct implementation phase (Portal sync + Entitlements)
 */
async function runDirectSetup(options: IosSetupCommandOptions): Promise<IosSetupResult> {
  const uiOptions: IosSetupOptions = {
    apiKeyPath: options.apiKeyPath,
    keyId: options.keyId,
    issuerId: options.issuerId,
    bundleId: options.bundleId,
    skipPortal: options.skipPortal ?? (!options.apiKeyPath && !options.keyId && !options.issuerId),
    pushEnvironment: options.pushEnvironment,
  };

  return new Promise((resolve) => {
    const { unmount } = render(
      <IosSetupUI
        options={uiOptions}
        onComplete={(result) => {
          unmount();
          resolve(result);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

/**
 * Run the guided setup phase (Extension file generation + Xcode configuration guide)
 * Replaces the agent-based approach with static file generation and step-by-step guide
 */
async function runGuidedSetup(
  directResult: IosSetupResult,
): Promise<GuidedSetupResult | undefined> {
  if (!directResult.agentContext) {
    return undefined;
  }

  const context: GuidedSetupContext = {
    bundleId: directResult.agentContext.bundleId,
    appGroupId: directResult.agentContext.appGroupId,
    appName: directResult.agentContext.appName,
    iosDir: directResult.agentContext.iosDir,
    entitlementsPath: directResult.agentContext.entitlementsPath,
  };

  return new Promise((resolve) => {
    const { unmount } = render(
      <GuidedSetupWizard
        context={context}
        onComplete={(result) => {
          unmount();
          resolve(result);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

/**
 * Confirmation prompt component for push setup
 */
function PushSetupConfirmation({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}): React.ReactElement {
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
}

/**
 * Ask user if they want to set up push notifications
 */
async function askPushSetupConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <PushSetupConfirmation
        onYes={() => {
          unmount();
          resolve(true);
        }}
        onNo={() => {
          unmount();
          resolve(false);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

/**
 * Run the push setup wizard (Phase 3)
 */
async function runPushSetup(directResult: IosSetupResult): Promise<PushSetupResult | null> {
  const projectPath = process.cwd();

  return new Promise((resolve) => {
    const { unmount } = render(
      <PushSetupWizard
        projectPath={projectPath}
        preDetectedBundleId={directResult.bundleId}
        preDetectedFirebaseProjectId={directResult.firebaseProjectId}
        onComplete={(result) => {
          unmount();
          resolve(result);
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

/**
 * Print consolidated output for all phases
 */
function printConsolidatedOutput(
  directResult: IosSetupResult,
  guidedResult: GuidedSetupResult | undefined,
  pushResult: PushSetupResult | null,
): void {
  console.log('\n');
  console.log('═══════════════════════════════════════════════');
  console.log('            iOS Push Setup Complete!           ');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // Phase 1 summary
  if (directResult.success) {
    console.log('✓ Capabilities configured');
    console.log('✓ Entitlements created');
  }

  // Phase 2 summary
  if (guidedResult?.success) {
    console.log('✓ Extension files created');
    if (guidedResult.createdFiles.length > 0) {
      for (const file of guidedResult.createdFiles) {
        console.log(`  • ${file}`);
      }
    }
  }

  // Phase 3 summary
  if (pushResult?.success) {
    console.log('✓ APNS key registered with Firebase');
    if (pushResult.context?.pushKey) {
      console.log(`  Key ID: ${pushResult.context.pushKey.apnsKeyId}`);
      console.log(`  Team ID: ${pushResult.context.pushKey.teamId}`);
    }
  } else if (pushResult === null) {
    console.log('○ APNS key setup skipped');
  }

  console.log('');
  console.log('Your iOS app is ready to receive push notifications!');
  console.log('');
}

export async function runIosSetupCommand(options: IosSetupCommandOptions): Promise<void> {
  // Phase 1: Direct implementation (Portal sync + Entitlements)
  const directResult = await runDirectSetup(options);

  if (!directResult.success) {
    printFinalOutput(toDirectSetupOutput(directResult));
    return;
  }

  // Show direct setup completion
  printFinalOutput(toDirectSetupOutput(directResult));

  // Phase 2: Guided setup (Extension file generation + Xcode configuration guide)
  let guidedResult: GuidedSetupResult | undefined;
  if (directResult.agentContext) {
    console.log('\n'); // Add spacing before guided setup phase
    guidedResult = await runGuidedSetup(directResult);
  }

  // Phase 3: Push setup (optional - APNS key + Firebase)
  // Only ask if Phase 1 & 2 were successful
  if (directResult.success && (!guidedResult || guidedResult.success)) {
    console.log('\n'); // Add spacing before push setup prompt
    const shouldSetupPush = await askPushSetupConfirmation();

    if (shouldSetupPush) {
      const pushResult = await runPushSetup(directResult);
      printConsolidatedOutput(directResult, guidedResult, pushResult);
    } else {
      printConsolidatedOutput(directResult, guidedResult, null);
    }
  }
}
