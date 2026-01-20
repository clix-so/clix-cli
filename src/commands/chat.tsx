import { render } from 'ink';
import type { AgentInfo } from '../lib/agents';
import { getConfigManager } from '../lib/config/index';
import { AgentSelectionService } from '../lib/services/agent-selection-service';
import { loadChatSession, ONE_WEEK_MS } from '../lib/services/session-store';
import {
  checkForUpdate,
  detectInstallationMethod,
  shouldCheckForUpdate,
  type UpdateCheckResult,
} from '../lib/services/update-service';
import { ChatApp } from '../ui/chat/ChatApp';
import { AgentSelector } from '../ui/components/AgentSelector';
import { NoAgentGuide } from '../ui/components/NoAgentGuide';

async function selectAgent(availableAgents: AgentInfo[]): Promise<AgentInfo> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <AgentSelector
        agents={availableAgents}
        onSelect={(agent) => {
          unmount();
          resolve(agent);
        }}
      />,
      { incrementalRendering: true },
    );
  });
}

export interface ChatCommandOptions {
  resumeSessionId?: string;
}

export async function chatCommand(options?: ChatCommandOptions): Promise<void> {
  // Load configuration
  const config = getConfigManager();
  const cfg = await config.load();

  // Start non-blocking update check if enabled
  let updateCheckPromise: Promise<{
    result: UpdateCheckResult;
    installMethod: string;
  } | null> | null = null;

  if (!cfg.update?.disableAutoCheck && shouldCheckForUpdate(cfg.update?.lastCheckTime)) {
    updateCheckPromise = (async () => {
      try {
        const [result, info] = await Promise.all([
          checkForUpdate(2000),
          detectInstallationMethod(),
        ]);

        // Save last check time
        await config.save({
          update: {
            ...cfg.update,
            lastCheckTime: new Date().toISOString(),
            lastKnownVersion: result.latestVersion ?? undefined,
          },
        });

        return { result, installMethod: info.method };
      } catch {
        return null;
      }
    })();
  }

  // Load session to get preferred agent (if resuming)
  let preferredAgentName: string | undefined;
  if (options?.resumeSessionId) {
    const session = await loadChatSession(options.resumeSessionId);
    if (session && Date.now() - session.updatedAt <= ONE_WEEK_MS) {
      preferredAgentName = session.currentAgentName ?? undefined;
    }
  }

  // Use AgentSelectionService for agent selection
  const selectionService = new AgentSelectionService(config);
  const result = await selectionService.selectAgent({
    mode: 'interactive',
    allowPrompt: true,
    preferredAgentName,
  });

  if (!result.agent && result.availableAgents.length === 0) {
    // No agents available - show installation guide
    return new Promise((resolve) => {
      const { unmount } = render(
        <NoAgentGuide
          onExit={() => {
            unmount();
            resolve();
          }}
        />,
        { incrementalRendering: true },
      );
    });
  }

  let selectedAgent: AgentInfo;

  if (result.needsUserSelection) {
    // Multiple agents available, let user choose
    selectedAgent = await selectAgent(result.availableAgents);
    await selectionService.saveSelection(selectedAgent);
  } else if (result.agent) {
    selectedAgent = result.agent;
    // Save selection if it was auto-selected
    if (result.source === 'auto') {
      await selectionService.saveSelection(selectedAgent);
    }
  } else {
    // Should not reach here, but fallback to first available agent
    selectedAgent = result.availableAgents[0];
    await selectionService.saveSelection(selectedAgent);
  }

  // At this point selectedAgent is guaranteed to be defined
  const agent = selectedAgent;

  // Render the chat app
  return new Promise((resolve) => {
    const { unmount } = render(
      <ChatApp
        agent={agent}
        onExit={() => {
          unmount();
          resolve();
        }}
        updateCheckPromise={updateCheckPromise}
        disableUpdateNag={cfg.update?.disableUpdateNag ?? false}
        initialSessionId={options?.resumeSessionId}
      />,
      { incrementalRendering: true, exitOnCtrlC: false },
    );
  });
}
