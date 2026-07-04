import { afterEach, describe, expect, test } from 'bun:test';
import { AUTH_ENV_VARS, getAuth0Config } from '../config';
import { PKCEFlowService } from '../pkce-flow';

const authEnvVars = Object.values(AUTH_ENV_VARS);
const previousEnv = new Map(authEnvVars.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of authEnvVars) {
    const previous = previousEnv.get(key);
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

describe('Auth0 PKCE flow', () => {
  test('uses the production Auth0 organization for the bundled client', () => {
    for (const key of authEnvVars) {
      delete process.env[key];
    }

    expect(getAuth0Config().organizationId).toBe('org_X7z9sXwAd3bWpEqu');
  });

  test('does not use the production Auth0 organization for custom clients', () => {
    for (const key of authEnvVars) {
      delete process.env[key];
    }

    process.env[AUTH_ENV_VARS.AUTH0_CLIENT_ID] = 'custom-client-id';

    expect(getAuth0Config().organizationId).toBeUndefined();
  });

  test('allows custom Auth0 organization override', () => {
    for (const key of authEnvVars) {
      delete process.env[key];
    }

    process.env[AUTH_ENV_VARS.AUTH0_CLIENT_ID] = 'custom-client-id';
    process.env[AUTH_ENV_VARS.AUTH0_ORGANIZATION_ID] = 'org_custom';

    expect(getAuth0Config().organizationId).toBe('org_custom');
  });

  test('includes organization in authorization URL', async () => {
    const service = new PKCEFlowService({
      domain: 'example.auth0.com',
      clientId: 'client-id',
      organizationId: 'org_test',
      audience: 'https://example.auth0.com/api/v2/',
      scope: 'openid profile email offline_access',
    });

    try {
      const { authUrl } = await service.startAuthFlow();
      expect(new URL(authUrl).searchParams.get('organization')).toBe('org_test');
    } finally {
      service.abort();
    }
  });
});
