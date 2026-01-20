import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CHAT_SESSION_SCHEMA_VERSION,
  cleanupOldChatSessions,
  loadChatSession,
  loadLatestChatSession,
  ONE_WEEK_MS,
  type PersistedChatSession,
  saveChatSession,
} from '@/lib/services/session-store';

describe('chat session persistence', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clix-sessions-'));
    process.env.CLIX_SESSION_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.CLIX_SESSION_DIR = undefined;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('keeps sessions within one week and deletes older', async () => {
    const now = Date.now();

    const oldSession: PersistedChatSession = {
      version: CHAT_SESSION_SCHEMA_VERSION,
      id: 'old',
      createdAt: now - ONE_WEEK_MS * 2,
      updatedAt: now - ONE_WEEK_MS * 2,
      currentAgentName: null,
      messages: [],
      inputHistory: [],
      agentSessions: {},
    };

    const recentSession: PersistedChatSession = {
      version: CHAT_SESSION_SCHEMA_VERSION,
      id: 'recent',
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
      currentAgentName: null,
      messages: [],
      inputHistory: [],
      agentSessions: {},
    };

    await saveChatSession(oldSession);
    await saveChatSession(recentSession);

    const result = await cleanupOldChatSessions(ONE_WEEK_MS);
    expect(result.deleted).toBe(1);

    expect(await loadChatSession('old')).toBeNull();
    expect(await loadChatSession('recent')).not.toBeNull();
  });

  test('loads the most recently updated session', async () => {
    const now = Date.now();

    await saveChatSession({
      version: CHAT_SESSION_SCHEMA_VERSION,
      id: 'a',
      createdAt: now,
      updatedAt: now - 10_000,
      currentAgentName: 'claude',
      messages: [],
      inputHistory: [],
      agentSessions: {},
    });

    await saveChatSession({
      version: CHAT_SESSION_SCHEMA_VERSION,
      id: 'b',
      createdAt: now,
      updatedAt: now - 1_000,
      currentAgentName: 'codex',
      messages: [],
      inputHistory: [],
      agentSessions: {},
    });

    const latest = await loadLatestChatSession(ONE_WEEK_MS);
    expect(latest?.id).toBe('b');
    expect(latest?.currentAgentName).toBe('codex');
  });
});
