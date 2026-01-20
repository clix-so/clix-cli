import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentInfo } from '@/lib/agents';
import { getAgentByName } from '@/lib/agents';
import {
  CHAT_SESSION_SCHEMA_VERSION,
  cleanupOldChatSessions,
  createChatSessionId,
  deserializeChatMessages,
  loadChatSession,
  ONE_WEEK_MS,
  type PersistedChatSession,
  saveChatSession,
  serializeChatMessages,
} from '@/lib/services/session-store';
import { useChatContext } from '../context/ChatContext';
import type { ChatRefs } from './types';

export interface SessionPersistenceAPI {
  isReady: boolean;
  preferredAgent: AgentInfo | null;
  persistSession(): Promise<void>;
  startNewSession(): Promise<void>;
  loadSession(sessionId: string): Promise<AgentInfo | null>;
}

export interface SessionPersistenceOptions {
  initialSessionId?: string;
}

export function useSessionPersistence(
  refs: ChatRefs,
  options?: SessionPersistenceOptions,
): SessionPersistenceAPI {
  const { state, dispatch } = useChatContext();
  const { executorRef, chatSessionIdRef, agentSessionMapRef } = refs;

  const createdAtRef = useRef<number>(Date.now());
  const stateRef = useRef(state);

  const [isReady, setIsReady] = useState(false);
  const [preferredAgent, setPreferredAgent] = useState<AgentInfo | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistSession = useCallback(async () => {
    const sessionId = chatSessionIdRef.current;
    if (!sessionId) return;

    const currentState = stateRef.current;
    const agentName = currentState.currentAgent?.name ?? null;

    // Keep per-agent session IDs up-to-date.
    if (agentName && executorRef.current) {
      agentSessionMapRef.current = {
        ...agentSessionMapRef.current,
        [agentName]: executorRef.current.getSessionId(),
      };
    }

    const session: PersistedChatSession = {
      version: CHAT_SESSION_SCHEMA_VERSION,
      id: sessionId,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      currentAgentName: agentName,
      messages: serializeChatMessages(currentState.messages),
      inputHistory: currentState.inputHistory,
      agentSessions: agentSessionMapRef.current,
    };

    await saveChatSession(session);
  }, [agentSessionMapRef, chatSessionIdRef, executorRef]);

  const startNewSession = useCallback(async () => {
    await cleanupOldChatSessions(ONE_WEEK_MS);

    const newId = createChatSessionId();
    chatSessionIdRef.current = newId;
    agentSessionMapRef.current = {};
    createdAtRef.current = Date.now();

    const empty: PersistedChatSession = {
      version: CHAT_SESSION_SCHEMA_VERSION,
      id: newId,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      currentAgentName: null,
      messages: [],
      inputHistory: [],
      agentSessions: {},
    };

    await saveChatSession(empty);
  }, [agentSessionMapRef, chatSessionIdRef]);

  const applySession = useCallback(
    (session: PersistedChatSession) => {
      chatSessionIdRef.current = session.id;
      agentSessionMapRef.current = session.agentSessions ?? {};
      createdAtRef.current = session.createdAt;

      dispatch({
        type: 'LOAD_PERSISTED_SESSION',
        payload: {
          messages: deserializeChatMessages(session.messages),
          inputHistory: session.inputHistory,
        },
      });

      const agent = session.currentAgentName ? getAgentByName(session.currentAgentName) : null;
      setPreferredAgent(agent ?? null);
      return agent ?? null;
    },
    [agentSessionMapRef, chatSessionIdRef, dispatch],
  );

  const loadSession = useCallback(
    async (sessionId: string): Promise<AgentInfo | null> => {
      await cleanupOldChatSessions(ONE_WEEK_MS);

      const session = await loadChatSession(sessionId);
      if (!session) return null;
      if (Date.now() - session.updatedAt > ONE_WEEK_MS) return null;

      return applySession(session);
    },
    [applySession],
  );

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      await cleanupOldChatSessions(ONE_WEEK_MS);

      const initialSessionId = options?.initialSessionId;
      if (initialSessionId) {
        const loaded = await loadChatSession(initialSessionId);
        if (loaded && Date.now() - loaded.updatedAt <= ONE_WEEK_MS) {
          if (!cancelled) {
            applySession(loaded);
            setIsReady(true);
          }
          return;
        }
      }

      // Always start a fresh session on app launch.
      const newId = createChatSessionId();
      chatSessionIdRef.current = newId;
      agentSessionMapRef.current = {};
      createdAtRef.current = Date.now();

      await saveChatSession({
        version: CHAT_SESSION_SCHEMA_VERSION,
        id: newId,
        createdAt: createdAtRef.current,
        updatedAt: Date.now(),
        currentAgentName: null,
        messages: [],
        inputHistory: [],
        agentSessions: {},
      });

      if (!cancelled) {
        setIsReady(true);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [applySession, options?.initialSessionId, agentSessionMapRef, chatSessionIdRef]);

  useEffect(() => {
    return () => {
      void persistSession();
    };
  }, [persistSession]);

  return {
    isReady,
    preferredAgent,
    persistSession,
    startNewSession,
    loadSession,
  };
}
