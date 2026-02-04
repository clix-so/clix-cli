import { Box, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentInfo } from '../../lib/agents';
import type { InstallationMethod, UpdateCheckResult } from '../../lib/services/update-service';
import { AgentSelector } from '../components/AgentSelector';
import { DebugPrompt } from '../components/DebugPrompt';
import { FirebaseWizard } from '../components/FirebaseWizard';
import { IosSetupFlow } from '../components/IosSetupFlow';
import { MCPInstallSelector } from '../components/MCPInstallSelector';
import { SessionSelector } from '../components/SessionSelector';
import { TransferSelector } from '../components/TransferSelector';
import { UpdateNotification } from '../components/UpdateNotification';
import { LoginUI } from '../LoginUI';
import { LogoutUI } from '../LogoutUI';
import { WhoamiUI } from '../WhoamiUI';
import { ChatFooter } from './components/ChatFooter';
import { ChatHeader } from './components/ChatHeader';
import { ChatInput } from './components/ChatInput';
import { MessageList } from './components/MessageList';
import { ChatProvider } from './context/ChatContext';
import { useChatActions } from './hooks/useChatActions';
import { useCommandHandler } from './hooks/useCommandHandler';
import { useOverlays } from './hooks/useOverlays';

interface UpdateInfo {
  result: UpdateCheckResult;
  installMethod: string;
}

interface ChatAppInnerProps {
  agent: AgentInfo;
  onExit: () => void;
  updateCheckPromise?: Promise<UpdateInfo | null> | null;
  disableUpdateNag?: boolean;
}

const ChatAppInner: React.FC<ChatAppInnerProps & { initialSessionId?: string }> = ({
  agent,
  onExit,
  updateCheckPromise,
  disableUpdateNag = false,
  initialSessionId,
}) => {
  const { exit } = useApp();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);

  // Handle update check result
  useEffect(() => {
    if (!updateCheckPromise || disableUpdateNag) return;

    updateCheckPromise.then((info) => {
      if (info?.result.hasUpdate) {
        setUpdateInfo(info);
        setShowUpdateNotification(true);

        // Auto-hide after 60 seconds
        const timer = setTimeout(() => {
          setShowUpdateNotification(false);
        }, 60000);

        return () => clearTimeout(timer);
      }
    });
  }, [updateCheckPromise, disableUpdateNag]);

  const chatActions = useChatActions({ initialSessionId });
  const {
    sessionReady,
    preferredAgent,
    initializeAgent,
    cancelRequest,
    isStreaming,
    currentAgent,
    messages,
    contextUsage,
    navigateHistory,
    transferSession,
    addSystemMessage,
  } = chatActions;

  // Initialize agent after session restore (if any)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!sessionReady || hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    initializeAgent(preferredAgent ?? agent);
  }, [agent, initializeAgent, preferredAgent, sessionReady]);

  // Handle escape key or Ctrl+C to cancel streaming
  useInput((input, key) => {
    if (isStreaming) {
      const isCtrlC = (input === 'c' && key.ctrl) || input === '\x03';
      if (key.escape || isCtrlC) {
        cancelRequest();
      }
    }
  });

  // Print transfer result and exit
  const handleTransferSuccess = useCallback(
    (result: { sessionFile: string; command: string; agentName: string }) => {
      onExit();
      console.log('\n✅ Session saved!\n');
      console.log(`File: ${result.sessionFile}\n`);
      console.log(`To continue in ${result.agentName}:\n`);
      console.log(result.command);
      console.log('');
      exit();
    },
    [onExit, exit],
  );

  // Overlay management
  const overlays = useOverlays({
    currentAgent,
    onTransferSuccess: handleTransferSuccess,
    addSystemMessage,
    transferSession,
    switchAgent: chatActions.switchAgent,
    resumeSession: chatActions.resumeSession,
    executeDebugSession: chatActions.executeDebugSession,
  });

  // Handle direct transfer command with agent name
  const handleTransferWithAgent = useCallback(
    async (targetAgent: string) => {
      const result = await transferSession(targetAgent as 'claude' | 'codex');
      if (result.success && result.sessionFile && result.command) {
        const agentDisplayName = targetAgent === 'claude' ? 'Claude Code' : 'Codex';
        handleTransferSuccess({
          sessionFile: result.sessionFile,
          command: result.command,
          agentName: agentDisplayName,
        });
      }
    },
    [transferSession, handleTransferSuccess],
  );

  // Command handler
  const { handleSubmit } = useCommandHandler({
    onExit,
    onTransferWithAgent: handleTransferWithAgent,
    chatActions,
    overlays,
  });

  // Handle exit from ChatInput (double Ctrl+C)
  const handleInputExit = useCallback(() => {
    onExit();
    exit();
  }, [onExit, exit]);

  // History navigation
  const handleHistoryNavigate = useCallback(
    (direction: 'up' | 'down'): string | null => {
      return navigateHistory(direction);
    },
    [navigateHistory],
  );

  const isOverlayActive = overlays.activeOverlay !== null;

  return (
    <Box flexDirection="column" minHeight={20}>
      <ChatHeader agent={currentAgent} isStreaming={isStreaming} />

      {/* Update notification */}
      {showUpdateNotification &&
        updateInfo?.result.hasUpdate &&
        updateInfo.result.latestVersion && (
          <UpdateNotification
            currentVersion={updateInfo.result.currentVersion}
            latestVersion={updateInfo.result.latestVersion}
            installationMethod={updateInfo.installMethod as InstallationMethod}
          />
        )}

      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} agentName={currentAgent?.displayName} />
      </Box>

      {/* Overlays */}
      {overlays.activeOverlay === 'agent' && (
        <AgentSelector
          agents={overlays.availableAgents}
          currentAgent={currentAgent}
          selectedIndex={overlays.agentSelectorIndex}
          onSelect={overlays.handleAgentSelect}
          onCancel={overlays.hideOverlay}
          onNavigate={overlays.handleAgentSelectorNavigate}
        />
      )}
      {overlays.activeOverlay === 'transfer' && (
        <TransferSelector
          agents={overlays.transferAgents}
          selectedIndex={overlays.transferSelectorIndex}
          onSelect={overlays.handleTransferSelect}
          onCancel={overlays.hideOverlay}
          onNavigate={overlays.handleTransferSelectorNavigate}
        />
      )}
      {overlays.activeOverlay === 'resume' && (
        <SessionSelector
          sessions={overlays.resumeSessions}
          selectedIndex={overlays.resumeSelectorIndex}
          onSelect={overlays.handleResumeSelect}
          onCancel={overlays.hideOverlay}
          onNavigate={overlays.handleResumeSelectorNavigate}
        />
      )}
      {overlays.activeOverlay === 'mcp' && (
        <MCPInstallSelector
          selectedIndex={overlays.mcpSelectorIndex}
          onSelect={overlays.handleMCPInstallSelect}
          onCancel={overlays.hideOverlay}
          onNavigate={overlays.handleMCPSelectorNavigate}
        />
      )}
      {overlays.activeOverlay === 'debug' && (
        <DebugPrompt onSubmit={overlays.handleDebugPromptSubmit} onCancel={overlays.hideOverlay} />
      )}
      {overlays.activeOverlay === 'firebase' && (
        <FirebaseWizard
          projectPath={process.cwd()}
          onComplete={overlays.handleFirebaseComplete}
          onCancel={overlays.handleFirebaseCancel}
        />
      )}
      {overlays.activeOverlay === 'ios-setup' && (
        <IosSetupFlow
          onComplete={(result) => {
            overlays.handleIosSetupComplete(result.message);
          }}
        />
      )}
      {overlays.activeOverlay === 'login' && (
        <LoginUI
          onComplete={(credentials) => {
            const expiresAt = new Date(credentials.expiresAt).toLocaleString();
            overlays.handleLoginComplete(`Login successful. Token expires at ${expiresAt}`);
          }}
          onError={(error) => {
            overlays.handleLoginComplete(`Login failed: ${error.message}`);
          }}
        />
      )}
      {overlays.activeOverlay === 'logout' && (
        <LogoutUI
          onComplete={(success) => {
            overlays.handleLogoutComplete(success ? 'Successfully logged out' : 'Logout failed');
          }}
        />
      )}
      {overlays.activeOverlay === 'whoami' && (
        <WhoamiUI
          onComplete={(result) => {
            if (result.status === 'ok') {
              overlays.handleWhoamiComplete(
                `Logged in as ${result.member.name} (${result.member.email})`,
              );
            } else if (result.status === 'not_logged_in') {
              overlays.handleWhoamiComplete('Not logged in. Run /login to authenticate.');
            } else {
              overlays.handleWhoamiComplete(`Error: ${result.message}`);
            }
          }}
        />
      )}

      {/* Input (hidden when overlay is active) */}
      {!isOverlayActive && (
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isStreaming || !sessionReady}
          onHistoryNavigate={handleHistoryNavigate}
          onExit={handleInputExit}
        />
      )}

      <ChatFooter
        isStreaming={isStreaming}
        contextRemaining={contextUsage.remaining}
        usedTokens={contextUsage.usedTokens}
        maxTokens={contextUsage.maxTokens}
      />
    </Box>
  );
};

interface ChatAppProps {
  agent: AgentInfo;
  onExit: () => void;
  updateCheckPromise?: Promise<UpdateInfo | null> | null;
  disableUpdateNag?: boolean;
}

export const ChatApp: React.FC<ChatAppProps & { initialSessionId?: string }> = ({
  agent,
  onExit,
  updateCheckPromise,
  disableUpdateNag,
  initialSessionId,
}) => {
  return (
    <ChatProvider>
      <ChatAppInner
        agent={agent}
        onExit={onExit}
        updateCheckPromise={updateCheckPromise}
        disableUpdateNag={disableUpdateNag}
        initialSessionId={initialSessionId}
      />
    </ChatProvider>
  );
};
