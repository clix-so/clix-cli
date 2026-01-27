import { Box, Text } from 'ink';
import type React from 'react';
import type {
  FirebaseCredentialFile,
  FirebaseDetectionResult,
  FirebaseIssue,
  GoogleServiceInfoPlist,
  GoogleServicesJson,
} from '@/lib/services/firebase';
import {
  extractProjectId,
  extractProjectIdFromPlist,
  platformNeedsAndroid,
  platformNeedsIos,
} from '@/lib/services/firebase';

interface FirebaseStatusDisplayProps {
  result: FirebaseDetectionResult;
  showDetails?: boolean;
  compact?: boolean;
}

/**
 * Status icon based on validity.
 */
function StatusIcon({ valid, exists }: { valid: boolean; exists: boolean }): React.ReactElement {
  if (!exists) {
    return (
      <Text color="red" bold>
        ✗
      </Text>
    );
  }
  if (valid) {
    return (
      <Text color="green" bold>
        ✓
      </Text>
    );
  }
  return (
    <Text color="yellow" bold>
      !
    </Text>
  );
}

/**
 * Display credential file status.
 */
function CredentialStatus({
  credential,
  label,
  showDetails,
}: {
  credential: FirebaseCredentialFile | null;
  label: string;
  showDetails?: boolean;
}): React.ReactElement {
  if (!credential) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="red" bold>
            ✗
          </Text>
          <Text> {label}: </Text>
          <Text color="red">not found</Text>
        </Box>
      </Box>
    );
  }

  const statusText = credential.valid ? 'valid' : 'invalid';
  const statusColor = credential.valid ? 'green' : 'red';

  return (
    <Box flexDirection="column">
      <Box>
        <StatusIcon valid={credential.valid} exists={credential.exists} />
        <Text> {label}: </Text>
        <Text color={statusColor}>{statusText}</Text>
      </Box>
      {showDetails && (
        <>
          <Box marginLeft={2}>
            <Text dimColor>Location: {credential.path}</Text>
          </Box>
          {credential.valid && credential.content && (
            <Box marginLeft={2}>
              <Text dimColor>
                Project ID:{' '}
                {credential.platform === 'android'
                  ? extractProjectId(credential.content as GoogleServicesJson)
                  : extractProjectIdFromPlist(credential.content as GoogleServiceInfoPlist)}
              </Text>
            </Box>
          )}
          {!credential.inExpectedLocation && credential.expectedPath && (
            <Box marginLeft={2}>
              <Text color="yellow">→ Expected: {credential.expectedPath}</Text>
            </Box>
          )}
          {!credential.valid && credential.errors.length > 0 && (
            <Box marginLeft={2} flexDirection="column">
              {credential.errors.slice(0, 3).map((error) => (
                <Text key={`${error.path}-${error.message}`} color="red">
                  • {error.message}
                </Text>
              ))}
              {credential.errors.length > 3 && (
                <Text dimColor>...and {credential.errors.length - 3} more errors</Text>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * Display issue list.
 */
function IssueList({ issues }: { issues: FirebaseIssue[] }): React.ReactElement | null {
  if (issues.length === 0) {
    return null;
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Issues:</Text>
      {errors.map((issue) => (
        <Box key={`error-${issue.platform}-${issue.type}-${issue.file || 'none'}`} marginLeft={1}>
          <Text color="red">✗ </Text>
          <Text color="red">{issue.description}</Text>
        </Box>
      ))}
      {warnings.map((issue) => (
        <Box key={`warning-${issue.platform}-${issue.type}-${issue.file || 'none'}`} marginLeft={1}>
          <Text color="yellow">! </Text>
          <Text color="yellow">{issue.description}</Text>
        </Box>
      ))}
      {infos.map((issue) => (
        <Box key={`info-${issue.platform}-${issue.type}-${issue.file || 'none'}`} marginLeft={1}>
          <Text color="blue">ℹ </Text>
          <Text>{issue.description}</Text>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Get status symbol for credential.
 */
function getStatusSymbol(
  credential: FirebaseCredentialFile | null | undefined,
  needed: boolean,
): string {
  if (!needed) return 'n/a';
  if (!credential) return '✗';
  return credential.valid ? '✓' : '!';
}

/**
 * Get status color for symbol.
 */
function getStatusColor(status: string): string {
  if (status === '✓') return 'green';
  if (status === '!') return 'yellow';
  return 'red';
}

/**
 * Compact status display.
 */
function CompactStatus({ result }: { result: FirebaseDetectionResult }): React.ReactElement {
  const needsAndroid = platformNeedsAndroid(result.platform);
  const needsIos = platformNeedsIos(result.platform);
  const androidStatus = getStatusSymbol(result.android, needsAndroid);
  const iosStatus = getStatusSymbol(result.ios, needsIos);

  return (
    <Box>
      <Text>Firebase: </Text>
      <Text color={getStatusColor(androidStatus)}>Android {androidStatus}</Text>
      <Text> </Text>
      <Text color={getStatusColor(iosStatus)}>iOS {iosStatus}</Text>
    </Box>
  );
}

/**
 * Display Firebase configuration status.
 */
export const FirebaseStatusDisplay: React.FC<FirebaseStatusDisplayProps> = ({
  result,
  showDetails = true,
  compact = false,
}) => {
  if (compact) {
    return <CompactStatus result={result} />;
  }

  const needsAndroid = platformNeedsAndroid(result.platform);
  const needsIos = platformNeedsIos(result.platform);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Firebase Configuration</Text>
        <Text dimColor> ({result.platform})</Text>
      </Box>

      {needsAndroid && (
        <CredentialStatus
          credential={result.android}
          label="Android (google-services.json)"
          showDetails={showDetails}
        />
      )}

      {needsIos && (
        <CredentialStatus
          credential={result.ios}
          label="iOS (GoogleService-Info.plist)"
          showDetails={showDetails}
        />
      )}

      {showDetails && <IssueList issues={result.issues} />}

      {result.configured && (
        <Box marginTop={1}>
          <Text color="green" bold>
            ✓ Firebase is configured
          </Text>
        </Box>
      )}
    </Box>
  );
};
