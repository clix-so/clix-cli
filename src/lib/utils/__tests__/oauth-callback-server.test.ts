import { describe, expect, test } from 'bun:test';
import { OAuthCallbackServer } from '../oauth';

describe('OAuthCallbackServer cancellation', () => {
  test('rejects pending wait when cancel is called', async () => {
    const server = new OAuthCallbackServer({ port: 0, timeoutMs: 10_000 });

    try {
      await server.start();
      const waitPromise = server.waitForCallback();
      server.cancel('Cancelled for test');
      await expect(waitPromise).rejects.toThrow('Cancelled for test');
    } finally {
      server.stop();
    }
  });

  test('rejects concurrent waits while callback is already pending', async () => {
    const server = new OAuthCallbackServer({ port: 0, timeoutMs: 10_000 });

    try {
      await server.start();
      const firstWait = server.waitForCallback();
      await expect(server.waitForCallback()).rejects.toThrow('OAuth callback already in progress');
      server.cancel('Cancelled for test');
      await expect(firstWait).rejects.toThrow('Cancelled for test');
    } finally {
      server.stop();
    }
  });
});
