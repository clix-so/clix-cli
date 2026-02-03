import { Box, render, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import {
  addClixToExtensionTarget,
  addNotificationServiceExtension,
  backupPodfile,
  backupProject,
  createExtensionFiles,
  type ExtensionContext,
  getExtensionBundleId,
  getExtensionName,
  hasPodfile,
} from '../../lib/ios';
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

/**
 * Result of automated project modification phase.
 */
interface ProjectModificationResult {
  success: boolean;
  extensionFilesCreated: boolean;
  pbxprojModified: boolean;
  podfileModified: boolean;
  createdFiles: string[];
  warnings: string[];
  /** If true, fall back to guided wizard for manual steps */
  requiresManualSteps: boolean;
  error?: string;
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
 * UI component for showing project modification progress.
 */
function ProjectModificationUI({
  status,
  warnings,
}: {
  status: string;
  warnings: string[];
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> {status}</Text>
      </Box>
      {warnings.map((warning) => (
        <Box key={warning} marginLeft={2}>
          <Text color="yellow">⚠ {warning}</Text>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Print the result of project modification.
 */
function printModificationResult(result: ProjectModificationResult): void {
  if (!result.extensionFilesCreated && !result.pbxprojModified && !result.podfileModified) {
    return;
  }

  console.log('');
  if (result.extensionFilesCreated) {
    console.log('✓ Extension files created');
    for (const file of result.createdFiles) {
      console.log(`  • ${file}`);
    }
  }
  if (result.pbxprojModified) {
    console.log('✓ Xcode project updated (NSE target added)');
  }
  if (result.podfileModified) {
    console.log('✓ Podfile updated (extension target added)');
    console.log('  Run: cd ios && pod install');
  }
  if (result.warnings.length > 0) {
    console.log('');
    for (const warning of result.warnings) {
      console.log(`⚠ ${warning}`);
    }
  }
}

/**
 * Execute the project modification steps.
 */
async function executeProjectModification(
  directResult: IosSetupResult,
  result: ProjectModificationResult,
  updateStatus: (status: string) => void,
  pushEnvironment?: 'development' | 'production',
): Promise<void> {
  const { agentContext } = directResult;
  if (!agentContext) return;

  const extensionName = getExtensionName(agentContext.appName);
  const extensionBundleId = getExtensionBundleId(agentContext.bundleId, agentContext.appName);
  const extensionDir = `${agentContext.iosDir}/${extensionName}`;

  // 1. Create extension files
  const extContext: ExtensionContext = {
    appName: agentContext.appName,
    bundleId: agentContext.bundleId,
    iosDir: agentContext.iosDir,
    pushEnvironment: pushEnvironment ?? 'development',
  };

  const extResult = await createExtensionFiles(extContext);
  if (extResult.success) {
    result.extensionFilesCreated = true;
    result.createdFiles.push(...extResult.createdFiles);
  } else {
    result.warnings.push(extResult.error || 'Failed to create extension files');
    result.requiresManualSteps = true;
    return;
  }

  // 2. Modify pbxproj
  updateStatus('Modifying Xcode project...');
  backupProject(agentContext.projectPath);

  const pbxResult = await addNotificationServiceExtension({
    projectPath: agentContext.projectPath,
    extensionName,
    extensionBundleId,
    extensionDir,
    appGroupId: agentContext.appGroupId,
    teamId: directResult.projectInfo?.teamId,
    deploymentTarget: '14.0',
  });

  if (pbxResult.success) {
    result.pbxprojModified = pbxResult.targetAdded;
    result.warnings.push(...pbxResult.warnings);
  } else {
    result.warnings.push(pbxResult.error || 'Failed to modify pbxproj');
    result.requiresManualSteps = true;
  }

  // 3. Modify Podfile (if exists)
  if (hasPodfile(agentContext.iosDir)) {
    updateStatus('Updating Podfile...');
    backupPodfile(agentContext.iosDir);

    const podResult = await addClixToExtensionTarget({
      iosDir: agentContext.iosDir,
      extensionName,
    });

    if (podResult.success) {
      result.podfileModified = podResult.modified;
    } else {
      result.warnings.push(podResult.error || 'Failed to modify Podfile');
    }
  }

  result.success = true;
}

/**
 * Run automated project modification phase.
 * Creates extension files and modifies pbxproj/Podfile programmatically.
 */
async function runProjectModification(
  directResult: IosSetupResult,
  pushEnvironment?: 'development' | 'production',
): Promise<ProjectModificationResult> {
  const result: ProjectModificationResult = {
    success: false,
    extensionFilesCreated: false,
    pbxprojModified: false,
    podfileModified: false,
    createdFiles: [],
    warnings: [],
    requiresManualSteps: false,
  };

  if (!directResult.agentContext) {
    result.success = true;
    return result;
  }

  // Render progress UI
  const displayWarnings: string[] = [];
  let currentStatus = 'Creating extension files...';

  const { unmount, rerender } = render(
    <ProjectModificationUI status={currentStatus} warnings={displayWarnings} />,
    { incrementalRendering: true },
  );

  const updateStatus = (status: string) => {
    currentStatus = status;
    displayWarnings.push(...result.warnings.filter((w) => !displayWarnings.includes(w)));
    rerender(<ProjectModificationUI status={currentStatus} warnings={displayWarnings} />);
  };

  try {
    await executeProjectModification(directResult, result, updateStatus, pushEnvironment);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.requiresManualSteps = true;
  } finally {
    unmount();
  }

  printModificationResult(result);
  return result;
}

/**
 * Run the guided setup phase (Extension file generation + Xcode configuration guide)
 * Used as fallback when automated modification fails or for manual verification.
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

export async function runIosSetupCommand(options: IosSetupCommandOptions): Promise<void> {
  // Phase 1: Direct implementation (Portal sync + Entitlements)
  const directResult = await runDirectSetup(options);

  if (!directResult.success) {
    printFinalOutput(toDirectSetupOutput(directResult));
    return;
  }

  // Show direct setup completion
  printFinalOutput(toDirectSetupOutput(directResult));

  // Phase 2: Automated project modification (pbxproj + Podfile)
  let modificationResult: ProjectModificationResult | undefined;
  let guidedResult: GuidedSetupResult | undefined;

  if (directResult.agentContext) {
    console.log('\n'); // Add spacing before modification phase
    modificationResult = await runProjectModification(directResult, options.pushEnvironment);

    // Fall back to guided setup if automated modification failed or requires manual steps
    if (modificationResult.requiresManualSteps) {
      console.log('\n'); // Add spacing before guided setup
      console.log('Some steps require manual configuration. Starting guided setup...');
      console.log('');
      guidedResult = await runGuidedSetup(directResult);
    }
  }

  // Phase 3: Push setup (optional - APNS key + Firebase)
  // Only ask if Phase 1 & 2 were successful
  const phase2Success =
    modificationResult?.success && !modificationResult.requiresManualSteps
      ? true
      : (guidedResult?.success ?? true);

  if (directResult.success && phase2Success) {
    console.log('\n'); // Add spacing before push setup prompt
    const shouldSetupPush = await askPushSetupConfirmation();

    if (shouldSetupPush) {
      const pushResult = await runPushSetup(directResult);
      printConsolidatedOutputWithModification(
        directResult,
        modificationResult,
        guidedResult,
        pushResult,
      );
    } else {
      printConsolidatedOutputWithModification(directResult, modificationResult, guidedResult, null);
    }
  }
}

/**
 * Print consolidated output including modification results.
 */
function printConsolidatedOutputWithModification(
  directResult: IosSetupResult,
  modificationResult: ProjectModificationResult | undefined,
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

  // Phase 2 summary (modification or guided)
  if (modificationResult?.extensionFilesCreated) {
    console.log('✓ Extension files created');
  }
  if (modificationResult?.pbxprojModified) {
    console.log('✓ Xcode project updated');
  }
  if (modificationResult?.podfileModified) {
    console.log('✓ Podfile updated');
  }
  if (guidedResult?.success) {
    console.log('✓ Guided setup completed');
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

  // Warnings
  if (modificationResult?.warnings && modificationResult.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const warning of modificationResult.warnings) {
      console.log(`  ⚠ ${warning}`);
    }
  }

  console.log('');
  console.log('Your iOS app is ready to receive push notifications!');
  console.log('');
}
