/**
 * Agent management hook for initialization, switching, and listing agents.
 */
import { useCallback } from 'react';
import type { AgentInfo } from '../../../lib/agents';
import { detectAvailableAgents, getAgentByName, SUPPORTED_AGENTS } from '../../../lib/agents';
import { getConfigManager } from '../../../lib/config/index';
import { createExecutor } from '../../../lib/executor';
import { generateMessageId, useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';
import type { SessionPersistenceAPI } from './useSessionPersistence';

/**
 * Hook for agent management operations.
 */
export function useAgentManagement(refs: ChatRefs, session: SessionPersistenceAPI) {
  const { state, dispatch } = useChatContext();
  const { executorRef, agentSessionMapRef } = refs;
  const { persistSession } = session;

  const initializeAgent = useCallback(
    async (agent: AgentInfo) => {
      dispatch({ type: 'SET_AGENT', payload: agent });
      const executor = await createExecutor(agent);

      const restoredSessionId = agentSessionMapRef.current[agent.name] ?? null;
      if (restoredSessionId) {
        executor.setSessionId(restoredSessionId);
      }

      executorRef.current = executor;
      await persistSession();
    },
    [dispatch, executorRef, agentSessionMapRef, persistSession],
  );

  const switchAgent = useCallback(
    async (agentName: string): Promise<boolean> => {
      const agent = getAgentByName(agentName);
      if (!agent) {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: generateMessageId(),
            role: 'system',
            content: `Unknown agent: ${agentName}. Use /agent to see available agents.`,
            timestamp: new Date(),
          },
        });
        return false;
      }

      // Check if agent is available
      const availableAgents = await detectAvailableAgents();
      const isAvailable = availableAgents.some((a) => a.name === agentName);

      if (!isAvailable) {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: generateMessageId(),
            role: 'system',
            content: `Agent "${agent.displayName}" is not installed. Install it from: ${agent.installUrl}`,
            timestamp: new Date(),
          },
        });
        return false;
      }

      // Persist current executor session ID before switching
      const previousAgentName = state.currentAgent?.name;
      if (previousAgentName && executorRef.current) {
        agentSessionMapRef.current = {
          ...agentSessionMapRef.current,
          [previousAgentName]: executorRef.current.getSessionId(),
        };
      }

      // Get current history before switching
      const previousHistory = executorRef.current?.getHistory() ?? [];

      // Switch to the new agent
      dispatch({ type: 'SET_AGENT', payload: agent });
      const newExecutor = await createExecutor(agent);

      // Transfer history to new agent (UI-level continuity)
      if (previousHistory.length > 0) {
        newExecutor.setHistory(previousHistory);
      }

      // Restore per-agent CLI session ID if available
      const restoredSessionId = agentSessionMapRef.current[agent.name] ?? null;
      if (restoredSessionId) {
        newExecutor.setSessionId(restoredSessionId);
      }

      executorRef.current = newExecutor;

      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: generateMessageId(),
          role: 'system',
          content: `Switched to ${agent.displayName}.`,
          timestamp: new Date(),
        },
      });

      // Save to config for persistence across app restarts
      const configManager = getConfigManager();
      await configManager.save({
        selectedAgent: agent.name,
        lastUsedAt: new Date().toISOString(),
      });

      await persistSession();
      return true;
    },
    [dispatch, executorRef, agentSessionMapRef, persistSession, state.currentAgent],
  );

  const listAgents = useCallback(async () => {
    const availableAgents = await detectAvailableAgents();
    const currentAgentName = state.currentAgent?.name;

    let message = 'Available agents:\n';
    availableAgents.forEach((agent) => {
      const isCurrent = agent.name === currentAgentName;
      const marker = isCurrent ? ' (current)' : '';
      message += `  /agent ${agent.name} - ${agent.displayName}${marker}\n`;
    });

    if (availableAgents.length === 0) {
      message = 'No agents available. Install one of the following:\n';
      SUPPORTED_AGENTS.forEach((agent) => {
        message += `  - ${agent.displayName}: ${agent.installUrl}\n`;
      });
      message = message.trimEnd();
    }

    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        id: generateMessageId(),
        role: 'system',
        content: message.trim(),
        timestamp: new Date(),
      },
    });
  }, [dispatch, state.currentAgent]);

  return {
    initializeAgent,
    switchAgent,
    listAgents,
    currentAgent: state.currentAgent,
  };
}
