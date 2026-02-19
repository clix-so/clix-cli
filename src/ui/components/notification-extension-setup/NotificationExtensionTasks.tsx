/**
 * Notification Extension setup task components.
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import type { PbxprojModificationResult, PodfileModificationResult } from '@/lib/ios';
import { type ExtensionGeneratorResult, verifyExtensionFiles } from '@/lib/ios/extension-generator';
import { StatusMessage } from '../StatusMessage';

export interface NotificationExtensionSetupContext {
  bundleId: string;
  appGroupId: string;
  appName: string;
  iosDir: string;
  xcodeprojPath: string;
  projectId: string;
  entitlementsPath: string;
  pushEnvironment?: 'development' | 'production';
}

export interface NotificationExtensionVerificationChecks {
  filesComplete: boolean;
  xcodeTargetConfigured: boolean;
  buildSettingsConfigured: boolean;
  podDependencyConfigured: boolean;
  notificationServiceConfigured: boolean;
  missingReasons: string[];
}

export const NotificationExtensionXcodeTask: React.FC<{
  extensionName: string;
  extensionBundleId: string;
  extensionResult: ExtensionGeneratorResult | null;
  appGroupId: string;
  xcodeResult: PbxprojModificationResult | null;
}> = ({ extensionName, extensionBundleId, extensionResult, appGroupId, xcodeResult }) => (
  <Box flexDirection="column">
    <Box marginBottom={1}>
      <Text bold color="cyan">
        Xcode Target Configuration
      </Text>
    </Box>

    {extensionResult && extensionResult.createdFiles.length > 0 && (
      <Box flexDirection="column" marginBottom={1}>
        <StatusMessage type="success" message="Extension files generated" />
        {extensionResult.createdFiles.map((filePath) => (
          <Box key={filePath} marginLeft={2}>
            <Text dimColor>• {filePath}</Text>
          </Box>
        ))}
      </Box>
    )}

    {!xcodeResult ? (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Applying Xcode target and build settings...</Text>
      </Box>
    ) : (
      <Box flexDirection="column" marginLeft={2}>
        <Text color={xcodeResult.success ? 'green' : 'red'}>
          {xcodeResult.success ? '✓' : '✗'} Xcode project update
        </Text>
        <Text color="gray">Target: {extensionName}</Text>
        <Text color="gray">Bundle ID: {extensionBundleId}</Text>
        <Text color="gray">App Group: {appGroupId}</Text>
        <Text color={xcodeResult.targetAdded ? 'green' : 'gray'}>
          {xcodeResult.targetAdded ? '✓ Target added' : '• Existing target reused'}
        </Text>
        {xcodeResult.error ? <Text color="red">Error: {xcodeResult.error}</Text> : null}
      </Box>
    )}
  </Box>
);

export const NotificationExtensionBuildSettingsTask: React.FC<{
  extensionName: string;
  entitlementsPath: string;
}> = ({ extensionName, entitlementsPath }) => (
  <Box flexDirection="column">
    <Box marginBottom={1}>
      <Text bold color="cyan">
        Build Settings
      </Text>
    </Box>
    <Box marginLeft={2} flexDirection="column">
      <Text color="green">✓ Extension build settings applied</Text>
      <Text color="gray">Target: {extensionName}</Text>
      <Text color="gray">Entitlements: {entitlementsPath}</Text>
    </Box>
  </Box>
);

export const NotificationExtensionDependenciesTask: React.FC<{
  extensionName: string;
  podfileResult: PodfileModificationResult | null;
}> = ({ extensionName, podfileResult }) => (
  <Box flexDirection="column">
    <Box marginBottom={1}>
      <Text bold color="cyan">
        Dependency Configuration
      </Text>
    </Box>

    {!podfileResult ? (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Configuring Clix dependency for {extensionName}...</Text>
      </Box>
    ) : (
      <Box marginLeft={2} flexDirection="column">
        {podfileResult.podfileExists ? (
          <Box flexDirection="column">
            <Text color={podfileResult.targetAdded ? 'green' : 'gray'}>
              {podfileResult.targetAdded ? '✓' : '•'} Podfile extension target
            </Text>
            <Text color={podfileResult.clixPodAdded ? 'green' : 'gray'}>
              {podfileResult.clixPodAdded ? '✓' : '•'} Clix pod dependency
            </Text>
          </Box>
        ) : (
          <Text color="gray">• Podfile not found (SPM/custom setup)</Text>
        )}
      </Box>
    )}
  </Box>
);

export const NotificationExtensionVerificationTask: React.FC<{
  context: NotificationExtensionSetupContext;
  extensionResult: ExtensionGeneratorResult | null;
  checks?: NotificationExtensionVerificationChecks | null;
}> = ({ context, extensionResult, checks }) => {
  const fileVerification = verifyExtensionFiles(context.iosDir, context.appName);
  const effectiveChecks: NotificationExtensionVerificationChecks = checks ?? {
    filesComplete: fileVerification.complete,
    xcodeTargetConfigured: false,
    buildSettingsConfigured: false,
    podDependencyConfigured: false,
    notificationServiceConfigured: false,
    missingReasons: fileVerification.complete
      ? []
      : [`Missing files: ${fileVerification.missingFiles.join(', ')}`],
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Verification
        </Text>
      </Box>

      <Box flexDirection="column" marginLeft={2}>
        <Text color={effectiveChecks.filesComplete ? 'green' : 'red'}>
          {effectiveChecks.filesComplete ? '✓' : '✗'} Extension files
        </Text>
        <Text color={effectiveChecks.xcodeTargetConfigured ? 'green' : 'red'}>
          {effectiveChecks.xcodeTargetConfigured ? '✓' : '✗'} Xcode NSE target
        </Text>
        <Text color={effectiveChecks.buildSettingsConfigured ? 'green' : 'red'}>
          {effectiveChecks.buildSettingsConfigured ? '✓' : '✗'} NSE build settings
        </Text>
        <Text color={effectiveChecks.podDependencyConfigured ? 'green' : 'red'}>
          {effectiveChecks.podDependencyConfigured ? '✓' : '✗'} Clix dependency
        </Text>
        <Text color={effectiveChecks.notificationServiceConfigured ? 'green' : 'red'}>
          {effectiveChecks.notificationServiceConfigured ? '✓' : '✗'} NotificationService.swift
        </Text>
      </Box>

      {effectiveChecks.missingReasons.length > 0 && (
        <Box marginTop={1} flexDirection="column" marginLeft={2}>
          <Text color="yellow" bold>
            Remaining issues:
          </Text>
          {effectiveChecks.missingReasons.map((reason) => (
            <Text key={reason} color="yellow">
              • {reason}
            </Text>
          ))}
        </Box>
      )}

      {extensionResult?.extensionDir ? (
        <Box marginTop={1} marginLeft={2}>
          <Text color="gray">Directory: {extensionResult.extensionDir}</Text>
        </Box>
      ) : null}
    </Box>
  );
};

export const NotificationExtensionCompleteTask: React.FC<{
  error: string | null;
  extensionResult: ExtensionGeneratorResult | null;
  warnings?: string[];
}> = ({ error, extensionResult, warnings = [] }) => (
  <Box flexDirection="column">
    {error ? (
      <StatusMessage type="error" message={error} />
    ) : (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="green">
            ✓ Notification Service Extension setup completed
          </Text>
        </Box>
        {extensionResult?.createdFiles.length ? (
          <Box flexDirection="column" marginLeft={2}>
            {extensionResult.createdFiles.map((filePath) => (
              <Text key={filePath} dimColor>
                • {filePath}
              </Text>
            ))}
          </Box>
        ) : null}
        {warnings.length > 0 ? (
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            <Text color="yellow">Warnings:</Text>
            {warnings.map((warning) => (
              <Text key={warning} color="yellow">
                • {warning}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    )}
  </Box>
);
