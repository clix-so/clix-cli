import React, { createContext, type ReactNode, useContext, useReducer } from 'react';
import type { AgentInfo } from '../../../lib/agents';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'tool' | 'system' | 'bash';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  toolName?: string;
  /** Bash command that was executed (for role='bash') */
  bashCommand?: string;
  /** Exit code from bash command (for role='bash') */
  bashExitCode?: number | null;
  /** Whether bash output was truncated (for role='bash') */
  bashTruncated?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentAgent: AgentInfo | null;
  inputHistory: string[];
  historyIndex: number;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'SET_STREAMING'; payload: boolean }
  | { type: 'SET_AGENT'; payload: AgentInfo | null }
  | { type: 'CLEAR_MESSAGES' }
  | {
      type: 'LOAD_PERSISTED_SESSION';
      payload: {
        messages: ChatMessage[];
        inputHistory: string[];
      };
    }
  | { type: 'ADD_TO_HISTORY'; payload: string }
  | { type: 'SET_HISTORY_INDEX'; payload: number };

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  currentAgent: null,
  inputHistory: [],
  historyIndex: -1,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg,
        ),
      };

    case 'SET_STREAMING':
      return {
        ...state,
        isStreaming: action.payload,
      };

    case 'SET_AGENT':
      return {
        ...state,
        currentAgent: action.payload,
      };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
        inputHistory: [],
        historyIndex: -1,
        isStreaming: false,
      };

    case 'LOAD_PERSISTED_SESSION':
      return {
        ...state,
        messages: action.payload.messages,
        inputHistory: action.payload.inputHistory,
        historyIndex: -1,
        isStreaming: false,
      };

    case 'ADD_TO_HISTORY':
      return {
        ...state,
        inputHistory: [...state.inputHistory, action.payload],
        historyIndex: -1,
      };

    case 'SET_HISTORY_INDEX':
      return {
        ...state,
        historyIndex: action.payload,
      };

    default:
      return state;
  }
}

interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  return <ChatContext.Provider value={{ state, dispatch }}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
