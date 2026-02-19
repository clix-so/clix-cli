import { describe, expect, mock, test } from 'bun:test';
import { FirebaseDownloader } from '../downloader';

interface MutableFirebaseDownloader {
  authClient: {
    authenticate: (
      openBrowser: (url: string) => void,
    ) => Promise<{ success: boolean; error?: string }>;
    cancelAuthentication: (reason?: string) => void;
    isAuthenticated: () => Promise<boolean>;
  };
}

describe('FirebaseDownloader.cancelAuthentication', () => {
  test('delegates cancellation to GoogleAuthClient', () => {
    const downloader = new FirebaseDownloader();
    const cancelAuthentication = mock((_reason?: string) => {});
    const authenticate = mock(
      async (_openBrowser: (url: string) => void): Promise<{ success: boolean }> => ({
        success: true,
      }),
    );
    const isAuthenticated = mock(async (): Promise<boolean> => false);
    const mutableDownloader = downloader as unknown as MutableFirebaseDownloader;

    mutableDownloader.authClient = {
      authenticate,
      cancelAuthentication,
      isAuthenticated,
    };

    downloader.cancelAuthentication('Task cancelled');

    expect(cancelAuthentication).toHaveBeenCalledTimes(1);
    expect(cancelAuthentication.mock.calls[0]?.[0]).toBe('Task cancelled');
  });

  test('skips OAuth flow when already authenticated', async () => {
    const downloader = new FirebaseDownloader();
    const authenticate = mock(
      async (_openBrowser: (url: string) => void): Promise<{ success: boolean }> => ({
        success: true,
      }),
    );
    const isAuthenticated = mock(async (): Promise<boolean> => true);
    const mutableDownloader = downloader as unknown as MutableFirebaseDownloader;
    const openBrowser = mock((_url: string) => {});

    mutableDownloader.authClient = {
      authenticate,
      cancelAuthentication: mock((_reason?: string) => {}),
      isAuthenticated,
    };

    const result = await downloader.authenticate(openBrowser);

    expect(result.success).toBe(true);
    expect(isAuthenticated).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledTimes(0);
    expect(openBrowser).toHaveBeenCalledTimes(0);
  });
});
