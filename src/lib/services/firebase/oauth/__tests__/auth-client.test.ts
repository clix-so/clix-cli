import { describe, expect, mock, test } from 'bun:test';
import { GoogleAuthClient } from '../auth-client';

interface MutableGoogleAuthClient {
  callbackServer: { cancel: (reason?: string) => void } | null;
  codeVerifier: string | null;
  oauthState: string | null;
}

describe('GoogleAuthClient.cancelAuthentication', () => {
  test('cancels callback server and clears OAuth runtime state', () => {
    const client = new GoogleAuthClient();
    const cancel = mock((_reason?: string) => {});
    const mutableClient = client as unknown as MutableGoogleAuthClient;

    mutableClient.callbackServer = { cancel };
    mutableClient.codeVerifier = 'verifier';
    mutableClient.oauthState = 'state';

    client.cancelAuthentication('User cancelled');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0]?.[0]).toBe('User cancelled');
    expect(mutableClient.callbackServer).toBeNull();
    expect(mutableClient.codeVerifier).toBeNull();
    expect(mutableClient.oauthState).toBeNull();
  });

  test('is safe when no callback server is active', () => {
    const client = new GoogleAuthClient();
    expect(() => client.cancelAuthentication()).not.toThrow();
  });
});
