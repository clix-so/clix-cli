import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getInternalApiClient, type Member, type Organization, type Project } from '@/lib/api';
import {
  createClixCredentials,
  getAuth0Config,
  getCredentialsManager,
  getIssuerUrl,
  openBrowser,
  PKCEFlowService,
  type TokenResponse,
} from '@/lib/auth';
import {
  CURRENT_PROJECT_CONFIG_VERSION,
  getProjectConfigManager,
  type ProjectConfig,
} from '@/lib/config';
import {
  fetchOrganizationsWithProjects,
  type OrgWithProjects,
} from '@/lib/services/organization-projects';
import { detectProjectType } from '@/lib/services/project-detector';
import { Header } from '@/ui/components/Header';
import { ProjectSelector } from '@/ui/components/ProjectSelector';
import { StatusMessage } from '@/ui/components/StatusMessage';
import { formatTerminalHyperlink } from '@/ui/utils/terminalHyperlink';

type SetupPhase =
  | 'checking_auth'
  | 'starting_auth'
  | 'waiting_for_auth'
  | 'exchanging_code'
  | 'fetching_data'
  | 'selecting_project'
  | 'saving_config'
  | 'complete'
  | 'error';

interface SetupUIProps {
  /** Called when setup completes successfully */
  onComplete?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Project path (defaults to cwd) */
  projectPath?: string;
}

/** Fetch current member info */
async function fetchMember(): Promise<Member> {
  const apiClient = getInternalApiClient();
  return apiClient.getMe();
}

/** Fetch user name from API or ID token */
async function fetchUserName(
  pkceService: PKCEFlowService,
  tokenResponse?: TokenResponse,
): Promise<string> {
  try {
    const member = await fetchMember();
    return member.name || member.email;
  } catch {
    // Fall back to ID token
    if (tokenResponse?.id_token) {
      const userInfo = pkceService.parseIdToken(tokenResponse.id_token);
      if (userInfo) {
        return userInfo.name ?? userInfo.email ?? '';
      }
    }
    return '';
  }
}

export const SetupUI: React.FC<SetupUIProps> = ({ onComplete, onError, projectPath }) => {
  const { exit } = useApp();
  const [phase, setPhase] = useState<SetupPhase>('checking_auth');
  const [browserOpened, setBrowserOpened] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [organizations, setOrganizations] = useState<OrgWithProjects[]>([]);
  const [savedConfig, setSavedConfig] = useState<ProjectConfig | null>(null);
  const [workspacePath] = useState(() => projectPath ?? process.cwd());
  const pkceServiceRef = useRef<PKCEFlowService | null>(null);
  const memberRef = useRef<Member | null>(null);
  const reopenLink = authUrl ? formatTerminalHyperlink(authUrl, 'Open authentication URL') : null;

  const handleProjectSelect = useCallback(
    async (project: Project, org: Organization) => {
      setPhase('saving_config');

      try {
        // Fetch member info if not already fetched
        let member = memberRef.current;
        if (!member) {
          member = await fetchMember();
          memberRef.current = member;
        }

        // Detect project type
        const projectType = await detectProjectType(workspacePath);

        // Create project config
        const projectPublicKey = project.public_api_key ?? project.public_key;

        const config: ProjectConfig = {
          version: CURRENT_PROJECT_CONFIG_VERSION,
          member: {
            id: member.id,
            email: member.email,
            name: member.name,
          },
          organization: {
            id: org.id,
            name: org.name,
          },
          project: {
            id: project.id,
            name: project.name,
            ...(projectPublicKey && { public_api_key: projectPublicKey }),
          },
          projectType,
          linkedAt: new Date().toISOString(),
        };

        // Save to .clix/config.jsonc
        const projectConfigManager = getProjectConfigManager(workspacePath);
        await projectConfigManager.save(config);

        setSavedConfig(config);
        setPhase('complete');

        setTimeout(() => {
          if (onComplete) {
            onComplete();
          } else {
            exit();
          }
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save configuration';
        setErrorMessage(message);
        setPhase('error');
        if (onError) {
          onError(error instanceof Error ? error : new Error(message));
        }
      }
    },
    [workspacePath, onComplete, onError, exit],
  );

  const handleProjectSkip = useCallback(() => {
    // Cannot skip project selection in setup - it's required
    // This callback is provided but should not be used
  }, []);

  useEffect(() => {
    const config = getAuth0Config();
    const pkceService = new PKCEFlowService(config);
    pkceServiceRef.current = pkceService;
    const credentialsManager = getCredentialsManager();

    const runSetup = async () => {
      try {
        // Check if already authenticated
        setPhase('checking_auth');
        const isAuthenticated = await credentialsManager.isAuthenticated();

        if (isAuthenticated) {
          // Already logged in, fetch data in parallel
          setPhase('fetching_data');
          const [member, orgsData] = await Promise.all([
            fetchMember(),
            fetchOrganizationsWithProjects(),
          ]);
          const name = member.name || member.email;
          setUserName(name);
          memberRef.current = member;
          setOrganizations(orgsData);

          // Check if there are projects to select from
          const hasProjects = orgsData.some((o) => o.projects.length > 0);
          if (hasProjects) {
            setPhase('selecting_project');
          } else {
            setErrorMessage(
              'No projects found. Please create a project in the Clix console first.',
            );
            setPhase('error');
          }
          return;
        }

        // Not authenticated - start login flow
        setPhase('starting_auth');
        const { authUrl: url } = await pkceService.startAuthFlow();
        setAuthUrl(url);

        // Open browser
        const opened = await openBrowser(url);
        setBrowserOpened(opened);
        setPhase('waiting_for_auth');

        // Wait for callback
        const code = await pkceService.waitForCallback();

        // Exchange code for tokens
        setPhase('exchanging_code');
        const tokenResponse = await pkceService.exchangeCodeForTokens(code);

        // Save credentials
        const issuer = getIssuerUrl(config);
        const credentials = createClixCredentials(tokenResponse, issuer, config.audience);
        await credentialsManager.saveClixCredentials(credentials);

        // Fetch user data
        setPhase('fetching_data');
        const name = await fetchUserName(pkceService, tokenResponse);
        setUserName(name);

        const member = await fetchMember();
        memberRef.current = member;

        const orgsData = await fetchOrganizationsWithProjects();
        setOrganizations(orgsData);

        // Check if there are projects to select from
        const hasProjects = orgsData.some((o) => o.projects.length > 0);
        if (hasProjects) {
          setPhase('selecting_project');
        } else {
          setErrorMessage('No projects found. Please create a project in the Clix console first.');
          setPhase('error');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Setup failed';
        setErrorMessage(message);
        setPhase('error');
        if (onError) {
          onError(error instanceof Error ? error : new Error(message));
        } else {
          setTimeout(() => exit(), 2000);
        }
      }
    };

    runSetup();

    // Cleanup on unmount
    return () => {
      pkceServiceRef.current?.abort();
    };
  }, [exit, onError]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Clix Project Setup" />

      {phase === 'checking_auth' && (
        <StatusMessage type="loading" message="Checking authentication..." />
      )}

      {phase === 'starting_auth' && (
        <StatusMessage type="loading" message="Starting authentication..." />
      )}

      {phase === 'waiting_for_auth' && (
        <Box flexDirection="column">
          {browserOpened ? (
            <Box>
              <Text color="green">✓</Text>
              <Text> Browser opened for authentication</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color="yellow">⚠</Text>
              <Text> Could not open browser automatically.</Text>
            </Box>
          )}
          {authUrl ? (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>If browser was closed, reopen this URL:</Text>
              <Text color="cyan">{reopenLink}</Text>
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>Direct URL:</Text>
                <Text>{authUrl}</Text>
              </Box>
            </Box>
          ) : null}
          <Box marginTop={2}>
            <Text dimColor>
              <Spinner type="dots" />
            </Text>
            <Text> Waiting for authentication in browser...</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press </Text>
            <Text color="gray">Ctrl+C</Text>
            <Text dimColor> to cancel</Text>
          </Box>
        </Box>
      )}

      {phase === 'exchanging_code' && (
        <StatusMessage type="loading" message="Exchanging authorization code..." />
      )}

      {phase === 'fetching_data' && (
        <StatusMessage type="loading" message="Fetching project information..." />
      )}

      {phase === 'selecting_project' && (
        <Box flexDirection="column">
          <Box>
            <Text color="green" bold>
              ✓
            </Text>
            <Text> Authenticated</Text>
          </Box>
          {userName && (
            <Box marginTop={1} marginLeft={2}>
              <Text dimColor>Welcome, </Text>
              <Text bold>{userName}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>Select a project to link to this directory:</Text>
          </Box>
          <ProjectSelector
            organizations={organizations}
            onSelect={handleProjectSelect}
            onSkip={handleProjectSkip}
            workspacePath={workspacePath}
            showSkip={false}
          />
        </Box>
      )}

      {phase === 'saving_config' && (
        <StatusMessage type="loading" message="Saving project configuration..." />
      )}

      {phase === 'complete' && savedConfig && (
        <Box flexDirection="column">
          <Box>
            <Text color="green" bold>
              ✓
            </Text>
            <Text> Project setup complete!</Text>
          </Box>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            <Box>
              <Text dimColor>Organization: </Text>
              <Text>{savedConfig.organization.name}</Text>
            </Box>
            <Box>
              <Text dimColor>Project: </Text>
              <Text color="cyan">{savedConfig.project.name}</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Config saved to: </Text>
              <Text color="gray">.clix/config.jsonc</Text>
            </Box>
          </Box>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <StatusMessage type="error" message={errorMessage} />
          <Box marginTop={1}>
            <Text dimColor>Please try again or check </Text>
            <Text color="cyan">https://console.clix.so</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
