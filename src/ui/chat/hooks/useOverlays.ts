/**
 * Overlay state management hook for modal-like UI elements.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  type ChatSessionSummary,
  listChatSessions,
  ONE_WEEK_MS,
} from '@/lib/services/session-store';
import type { AgentInfo } from '../../../lib/agents';
import { detectAvailableAgents } from '../../../lib/agents';
import {
  getMCPAgentConfigs,
  getMCPAgentDisplayName,
  installMCPServer,
  type MCPTargetAgent,
} from '../../../lib/services/mcp-install-service';
import type { useChatActions } from './useChatActions';

export type OverlayType =
  | 'agent'
  | 'transfer'
  | 'resume'
  | 'mcp'
  | 'debug'
  | 'firebase'
  | 'login'
  | 'logout'
  | 'whoami'
  | null;

interface UseOverlaysOptions {
  currentAgent: AgentInfo | null;
  onTransferSuccess: (result: { sessionFile: string; command: string; agentName: string }) => void;
  addSystemMessage: (content: string) => void;
  transferSession: ReturnType<typeof useChatActions>['transferSession'];
  switchAgent: ReturnType<typeof useChatActions>['switchAgent'];
  resumeSession: ReturnType<typeof useChatActions>['resumeSession'];
  executeDebugSession: ReturnType<typeof useChatActions>['executeDebugSession'];
}

/**
 * Hook for managing overlay/modal UI state.
 */
export function useOverlays(options: UseOverlaysOptions) {
  const {
    currentAgent,
    onTransferSuccess,
    addSystemMessage,
    transferSession,
    switchAgent,
    resumeSession,
    executeDebugSession,
  } = options;

  // Active overlay
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null);

  // Agent selector state
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [agentSelectorIndex, setAgentSelectorIndex] = useState(0);

  // Transfer selector state
  const [transferAgents, setTransferAgents] = useState<AgentInfo[]>([]);
  const [transferSelectorIndex, setTransferSelectorIndex] = useState(0);

  // Resume selector state
  const [resumeSessions, setResumeSessions] = useState<ChatSessionSummary[]>([]);
  const [resumeSelectorIndex, setResumeSelectorIndex] = useState(0);

  // MCP install selector state
  const [mcpSelectorIndex, setMCPSelectorIndex] = useState(0);

  // Load available agents when selector is shown
  useEffect(() => {
    if (activeOverlay === 'agent') {
      detectAvailableAgents().then((agents) => {
        setAvailableAgents(agents);
        const currentIndex = agents.findIndex((a) => a.name === currentAgent?.name);
        setAgentSelectorIndex(currentIndex >= 0 ? currentIndex : 0);
      });
    }
  }, [activeOverlay, currentAgent]);

  // Load transfer agents when transfer selector is shown
  useEffect(() => {
    if (activeOverlay === 'transfer') {
      detectAvailableAgents().then((agents) => {
        const transferable = agents.filter((a) => a.name === 'claude' || a.name === 'codex');
        setTransferAgents(transferable);
        setTransferSelectorIndex(0);
      });
    }
  }, [activeOverlay]);

  // Overlay openers
  const showAgentSelector = useCallback(() => setActiveOverlay('agent'), []);
  const showTransferSelector = useCallback(() => setActiveOverlay('transfer'), []);

  const showResumeSelector = useCallback(async () => {
    const sessions = await listChatSessions(ONE_WEEK_MS);
    if (sessions.length === 0) {
      addSystemMessage('No saved sessions found (last 7 days).');
      return;
    }
    setResumeSessions(sessions);
    setResumeSelectorIndex(0);
    setActiveOverlay('resume');
  }, [addSystemMessage]);

  const showMCPInstallSelector = useCallback(() => {
    setActiveOverlay('mcp');
    setMCPSelectorIndex(0);
  }, []);

  const showDebugPrompt = useCallback(() => setActiveOverlay('debug'), []);
  const showFirebaseWizard = useCallback(() => setActiveOverlay('firebase'), []);
  const showLoginOverlay = useCallback(() => setActiveOverlay('login'), []);
  const showLogoutOverlay = useCallback(() => setActiveOverlay('logout'), []);
  const showWhoamiOverlay = useCallback(() => setActiveOverlay('whoami'), []);
  const hideOverlay = useCallback(() => setActiveOverlay(null), []);

  // Agent selector handlers
  const handleAgentSelect = useCallback(
    async (selectedAgent: AgentInfo) => {
      setActiveOverlay(null);
      if (selectedAgent.name !== currentAgent?.name) {
        await switchAgent(selectedAgent.name);
      }
    },
    [switchAgent, currentAgent],
  );

  const handleAgentSelectorNavigate = useCallback(
    (direction: 'up' | 'down') => {
      setAgentSelectorIndex((prev) => {
        if (direction === 'up') {
          return prev > 0 ? prev - 1 : availableAgents.length - 1;
        } else {
          return prev < availableAgents.length - 1 ? prev + 1 : 0;
        }
      });
    },
    [availableAgents.length],
  );

  // Transfer selector handlers
  const handleTransferSelect = useCallback(
    async (selectedAgent: AgentInfo) => {
      setActiveOverlay(null);
      const result = await transferSession(selectedAgent.name as 'claude' | 'codex');
      if (result.success && result.sessionFile && result.command) {
        onTransferSuccess({
          sessionFile: result.sessionFile,
          command: result.command,
          agentName: selectedAgent.displayName,
        });
      }
    },
    [transferSession, onTransferSuccess],
  );

  const handleTransferSelectorNavigate = useCallback(
    (direction: 'up' | 'down') => {
      setTransferSelectorIndex((prev) => {
        if (direction === 'up') {
          return prev > 0 ? prev - 1 : transferAgents.length - 1;
        } else {
          return prev < transferAgents.length - 1 ? prev + 1 : 0;
        }
      });
    },
    [transferAgents.length],
  );

  // Resume selector handlers
  const handleResumeSelect = useCallback(
    async (session: ChatSessionSummary) => {
      setActiveOverlay(null);
      const ok = await resumeSession(session.id);
      if (!ok) {
        addSystemMessage('Cannot resume while streaming.');
      }
    },
    [addSystemMessage, resumeSession],
  );

  const handleResumeSelectorNavigate = useCallback(
    (direction: 'up' | 'down') => {
      setResumeSelectorIndex((prev) => {
        if (direction === 'up') {
          return prev > 0 ? prev - 1 : resumeSessions.length - 1;
        } else {
          return prev < resumeSessions.length - 1 ? prev + 1 : 0;
        }
      });
    },
    [resumeSessions.length],
  );

  // MCP install handlers
  const handleMCPInstallSelect = useCallback(
    async (agent: MCPTargetAgent) => {
      setActiveOverlay(null);
      addSystemMessage(`Installing Clix MCP Server for ${getMCPAgentDisplayName(agent)}...`);

      const result = await installMCPServer(agent);

      if (result.success) {
        addSystemMessage(result.message);
      } else {
        addSystemMessage(`Error: ${result.message}${result.error ? `\n${result.error}` : ''}`);
      }
    },
    [addSystemMessage],
  );

  const handleMCPSelectorNavigate = useCallback((direction: 'up' | 'down') => {
    const mcpAgents = getMCPAgentConfigs();
    setMCPSelectorIndex((prev) => {
      if (direction === 'up') {
        return prev > 0 ? prev - 1 : mcpAgents.length - 1;
      } else {
        return prev < mcpAgents.length - 1 ? prev + 1 : 0;
      }
    });
  }, []);

  // Debug prompt handlers
  const handleDebugPromptSubmit = useCallback(
    async (description: string) => {
      setActiveOverlay(null);
      await executeDebugSession(description);
    },
    [executeDebugSession],
  );

  // Firebase wizard handlers
  const handleFirebaseComplete = useCallback(
    (result: { completed?: boolean; skipped?: boolean }) => {
      setActiveOverlay(null);
      if (result.skipped) {
        addSystemMessage('Firebase setup skipped');
      } else if (result.completed) {
        addSystemMessage('Firebase configuration complete');
      }
    },
    [addSystemMessage],
  );

  const handleFirebaseCancel = useCallback(() => {
    setActiveOverlay(null);
    addSystemMessage('Firebase setup cancelled');
  }, [addSystemMessage]);

  // Login handlers
  const handleLoginComplete = useCallback(
    (message: string) => {
      setActiveOverlay(null);
      addSystemMessage(message);
    },
    [addSystemMessage],
  );

  // Logout handlers
  const handleLogoutComplete = useCallback(
    (message: string) => {
      setActiveOverlay(null);
      addSystemMessage(message);
    },
    [addSystemMessage],
  );

  // Whoami handlers
  const handleWhoamiComplete = useCallback(
    (message: string) => {
      setActiveOverlay(null);
      addSystemMessage(message);
    },
    [addSystemMessage],
  );

  return {
    activeOverlay,
    hideOverlay,

    // Agent selector
    showAgentSelector,
    availableAgents,
    agentSelectorIndex,
    handleAgentSelect,
    handleAgentSelectorNavigate,

    // Transfer selector
    showTransferSelector,
    transferAgents,
    transferSelectorIndex,
    handleTransferSelect,
    handleTransferSelectorNavigate,

    // Resume selector
    showResumeSelector,
    resumeSessions,
    resumeSelectorIndex,
    handleResumeSelect,
    handleResumeSelectorNavigate,

    // MCP install selector
    showMCPInstallSelector,
    mcpSelectorIndex,
    handleMCPInstallSelect,
    handleMCPSelectorNavigate,

    // Debug prompt
    showDebugPrompt,
    handleDebugPromptSubmit,

    // Firebase wizard
    showFirebaseWizard,
    handleFirebaseComplete,
    handleFirebaseCancel,

    // Auth overlays
    showLoginOverlay,
    handleLoginComplete,
    showLogoutOverlay,
    handleLogoutComplete,
    showWhoamiOverlay,
    handleWhoamiComplete,
  };
}
