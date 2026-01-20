import fs from 'node:fs/promises';
import path from 'node:path';
import { xdg } from '@/lib/utils/xdg';
import type { ChatMessage } from '@/ui/chat/context/ChatContext';

export const CHAT_SESSION_SCHEMA_VERSION = 1;

export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PersistedChatMessage {
  id: string;
  role: ChatMessage['role'];
  content: string;
  timestamp: number;
  status?: ChatMessage['status'];
  toolName?: string;
}

export interface PersistedChatSessionV1 {
  version: typeof CHAT_SESSION_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  updatedAt: number;
  currentAgentName: string | null;
  messages: PersistedChatMessage[];
  inputHistory: string[];
  agentSessions: Record<string, string | null>;
}

export type PersistedChatSession = PersistedChatSessionV1;

export interface ChatSessionSummary {
  id: string;
  updatedAt: number;
  currentAgentName: string | null;
  preview: string;
}

function resolveSessionsDir(): string {
  // Allow tests to override the location.
  if (process.env.CLIX_SESSION_DIR) {
    return process.env.CLIX_SESSION_DIR;
  }
  return path.join(xdg.state(), 'sessions');
}

async function ensureSessionsDir(): Promise<string> {
  const dir = resolveSessionsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function sessionFilePath(sessionId: string): string {
  return path.join(resolveSessionsDir(), `${sessionId}.json`);
}

export function createChatSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess-${Date.now()}-${rand}`;
}

export function serializeChatMessages(messages: ChatMessage[]): PersistedChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.getTime(),
    status: m.status,
    toolName: m.toolName,
  }));
}

export function deserializeChatMessages(messages: PersistedChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    status: m.status,
    toolName: m.toolName,
  }));
}

export async function saveChatSession(session: PersistedChatSession): Promise<void> {
  const dir = await ensureSessionsDir();
  const filePath = path.join(dir, `${session.id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

export async function loadChatSession(sessionId: string): Promise<PersistedChatSession | null> {
  try {
    const raw = await fs.readFile(sessionFilePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw) as PersistedChatSession;
    if (parsed.version !== CHAT_SESSION_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function listChatSessionIds(): Promise<string[]> {
  try {
    const dir = await ensureSessionsDir();
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
  } catch {
    return [];
  }
}

export async function loadLatestChatSession(
  maxAgeMs: number = ONE_WEEK_MS,
): Promise<PersistedChatSession | null> {
  const ids = await listChatSessionIds();
  if (ids.length === 0) return null;

  const now = Date.now();

  const sessions = await Promise.all(ids.map((id) => loadChatSession(id)));
  const candidates = sessions
    .filter((s): s is PersistedChatSession => !!s)
    .filter((s) => now - s.updatedAt <= maxAgeMs);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0] ?? null;
}

export async function cleanupOldChatSessions(
  maxAgeMs: number = ONE_WEEK_MS,
): Promise<{ deleted: number }> {
  const dir = await ensureSessionsDir();
  const ids = await listChatSessionIds();
  const now = Date.now();

  let deleted = 0;

  for (const id of ids) {
    const session = await loadChatSession(id);
    if (!session) continue;
    if (now - session.updatedAt <= maxAgeMs) continue;

    try {
      await fs.unlink(path.join(dir, `${id}.json`));
      deleted++;
    } catch {
      // ignore
    }
  }

  return { deleted };
}

function buildPreviewFromMessages(messages: PersistedChatMessage[]): string {
  const trimmedMessages = messages
    .map((m) => ({ role: m.role, content: (m.content ?? '').trim() }))
    .filter((m) => m.content.length > 0);

  const lastUser = [...trimmedMessages].reverse().find((m) => m.role === 'user');
  const candidate = lastUser ?? trimmedMessages[trimmedMessages.length - 1];
  if (!candidate) return '';

  // Collapse whitespace and keep it one-line.
  return candidate.content.replace(/\s+/g, ' ');
}

export async function listChatSessions(
  maxAgeMs: number = ONE_WEEK_MS,
): Promise<ChatSessionSummary[]> {
  await cleanupOldChatSessions(maxAgeMs);

  const ids = await listChatSessionIds();
  if (ids.length === 0) return [];

  const now = Date.now();
  const sessions = await Promise.all(ids.map((id) => loadChatSession(id)));

  const summaries: ChatSessionSummary[] = [];

  for (const session of sessions) {
    if (!session) continue;
    if (now - session.updatedAt > maxAgeMs) continue;

    summaries.push({
      id: session.id,
      updatedAt: session.updatedAt,
      currentAgentName: session.currentAgentName,
      preview: buildPreviewFromMessages(session.messages),
    });
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
}
