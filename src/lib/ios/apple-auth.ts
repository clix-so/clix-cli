/**
 * Apple account authentication for iOS setup.
 * Supports both API Key and User (Apple ID/Password) authentication.
 * Based on EAS CLI implementation using @expo/apple-utils.
 *
 * @module ios/apple-auth
 */

import * as fs from 'node:fs';
import {
  Auth,
  InvalidUserCredentialsError,
  JsonFileCache,
  type RequestContext,
  Session,
  Teams,
  Token,
} from '@expo/apple-utils';

import {
  CLIX_NO_KEYCHAIN,
  deletePasswordAsync,
  getAppleKeychainServiceName,
  getPasswordAsync,
  setPasswordAsync,
} from './keychain';

/**
 * Authentication modes supported by the Apple APIs.
 */
export enum AuthenticationMode {
  /** App Store Connect API Key (JWT-based, CI-friendly, no 2FA) */
  API_KEY = 'API_KEY',
  /** User credentials (cookie-based, more features, requires 2FA) */
  USER = 'USER',
}

/**
 * Apple team information.
 */
export interface AppleTeam {
  id: string;
  name?: string;
  inHouse: boolean;
}

/**
 * API Key authentication configuration.
 */
export interface ApiKeyAuthConfig {
  keyId: string;
  issuerId: string;
  keyP8: string;
}

/**
 * User authentication context (Apple ID/Password).
 */
export interface UserAuthContext {
  appleId: string;
  appleIdPassword?: string;
  team: AppleTeam;
  authState: Session.AuthState;
  fastlaneSession?: string;
}

/**
 * API Key authentication context.
 */
export interface ApiKeyAuthContext {
  team: AppleTeam;
  authState: {
    context: RequestContext;
  };
  ascApiKey: ApiKeyAuthConfig;
}

/**
 * Combined authentication context.
 */
export type AuthContext = UserAuthContext | ApiKeyAuthContext;

/**
 * Authentication options.
 */
export interface AuthOptions {
  appleId?: string;
  teamId?: string;
  teamName?: string;
  ascApiKey?: ApiKeyAuthConfig;
  cookies?: Session.AuthState['cookies'];
  mode?: AuthenticationMode;
}

/**
 * Check if auth context is user-based.
 */
export function isUserAuthContext(authCtx: AuthContext | undefined): authCtx is UserAuthContext {
  return !!authCtx && typeof (authCtx as UserAuthContext).appleId === 'string';
}

/**
 * Get request context from auth context.
 */
export function getRequestContext(authCtx: AuthContext): RequestContext {
  if (isUserAuthContext(authCtx)) {
    if (!authCtx.authState?.context) {
      throw new Error('Apple request context must be defined');
    }
    return authCtx.authState.context;
  }
  return authCtx.authState.context;
}

/**
 * Prompt for Apple ID (username).
 */
export async function promptAppleIdAsync(
  promptFn: (message: string, defaultValue?: string) => Promise<string>,
): Promise<string> {
  const lastAppleId = await getCachedUsernameAsync();

  console.log('› Log in to your Apple Developer account to continue');

  let username = await promptFn('Apple ID:', lastAppleId ?? undefined);

  // Remove any unprintable control characters (ASCII 0-31)
  username = removeControlCharacters(username);

  if (username && username !== lastAppleId) {
    await cacheUsernameAsync(username);
  }

  return username;
}

/**
 * Prompt for Apple ID password.
 */
export async function promptPasswordAsync(
  username: string,
  promptFn: (message: string) => Promise<string>,
): Promise<string> {
  const cachedPassword = await getCachedPasswordAsync(username);

  if (cachedPassword) {
    console.log(`› Using password for ${username} from your local Keychain`);
    return cachedPassword;
  }

  console.log('› The password is only used to authenticate with Apple and never stored on servers');

  const password = await promptFn(`Password (for ${username}):`);

  await cachePasswordAsync(username, password);
  return password;
}

/**
 * Cache username to file.
 */
async function cacheUsernameAsync(username: string): Promise<void> {
  if (!CLIX_NO_KEYCHAIN && username) {
    const cachedPath = JsonFileCache.usernameCachePath();
    await JsonFileCache.cacheAsync(cachedPath, { username });
  }
}

/**
 * Get cached username from file.
 */
async function getCachedUsernameAsync(): Promise<string | null> {
  if (CLIX_NO_KEYCHAIN) {
    try {
      await fs.promises.unlink(JsonFileCache.usernameCachePath());
    } catch {
      // File may not exist
    }
    return null;
  }

  const cached = await JsonFileCache.getCacheAsync(JsonFileCache.usernameCachePath());
  const lastAppleId = cached?.username ?? null;
  return typeof lastAppleId === 'string' ? lastAppleId : null;
}

/**
 * Cache password to Keychain.
 */
async function cachePasswordAsync(username: string, password: string): Promise<boolean> {
  if (CLIX_NO_KEYCHAIN) {
    console.log('› Skip storing Apple ID password in the local Keychain.');
    return false;
  }

  console.log('› Saving Apple ID password to the local Keychain');
  const serviceName = getAppleKeychainServiceName(username);
  return setPasswordAsync({ username, password, serviceName });
}

/**
 * Get cached password from Keychain.
 */
async function getCachedPasswordAsync(username: string): Promise<string | null> {
  if (CLIX_NO_KEYCHAIN) {
    await deletePasswordAsync({ username, serviceName: getAppleKeychainServiceName(username) });
    return null;
  }

  const serviceName = getAppleKeychainServiceName(username);
  return getPasswordAsync({ username, serviceName });
}

/**
 * Delete cached password from Keychain.
 */
export async function deleteCachedPasswordAsync(username: string): Promise<boolean> {
  const serviceName = getAppleKeychainServiceName(username);
  const success = await deletePasswordAsync({ username, serviceName });
  if (success) {
    console.log('› Removed Apple ID password from the native Keychain');
  }
  return success;
}

/**
 * Login with Apple ID credentials.
 * Handles session restoration, 2FA prompts (via @expo/apple-utils), and password caching.
 */
export async function loginWithUserCredentialsAsync(
  promptAppleId: (message: string, defaultValue?: string) => Promise<string>,
  promptPassword: (message: string) => Promise<string>,
  promptConfirm: (message: string) => Promise<boolean>,
  options: {
    cookies?: Session.AuthState['cookies'];
    teamId?: string;
    providerId?: number;
  } = {},
): Promise<UserAuthContext> {
  // Try login with cookies first
  if (options.cookies) {
    const session = await Auth.loginWithCookiesAsync({ cookies: options.cookies });
    if (session) {
      return await buildUserAuthContext(session);
    }
  }

  // Get username
  const username = await promptAppleIdAsync(promptAppleId);

  // Clear in-memory data
  Auth.resetInMemoryData();

  try {
    // Try restoring session
    const restoredSession = await Auth.tryRestoringAuthStateFromUserCredentialsAsync(
      {
        username,
        providerId: options.providerId,
        teamId: options.teamId,
      },
      { autoResolveProvider: true },
    );

    if (restoredSession) {
      return await buildUserAuthContext({ ...restoredSession });
    }

    // Full login with password
    const password = await promptPasswordAsync(username, promptPassword);
    const newSession = await Auth.loginWithUserCredentialsAsync(
      {
        username,
        password,
        providerId: options.providerId,
        teamId: options.teamId,
      },
      { autoResolveProvider: true },
    );

    if (!newSession) {
      throw new Error('An unexpected error occurred while completing authentication');
    }

    return await buildUserAuthContext({ password, ...newSession });
  } catch (error) {
    if (error instanceof InvalidUserCredentialsError) {
      console.error(error.message);
      await deleteCachedPasswordAsync(username);

      const retry = await promptConfirm('Would you like to try again?');
      if (retry) {
        return loginWithUserCredentialsAsync(promptAppleId, promptPassword, promptConfirm, {
          teamId: options.teamId,
          providerId: options.providerId,
        });
      }
      throw new Error('ABORTED');
    }
    throw error;
  }
}

/**
 * Build UserAuthContext from session.
 */
async function buildUserAuthContext(authState: Session.AuthState): Promise<UserAuthContext> {
  const teamId = authState.context.teamId;

  if (!teamId) {
    throw new Error('Team ID not found in authentication state');
  }

  // Get all teams to resolve user data
  const teams = await Teams.getTeamsAsync();
  const team = teams.find((t) => t.teamId === teamId);

  if (!team) {
    throw new Error(`Your account is not associated with Apple Team with ID: ${teamId}`);
  }

  const fastlaneSession = Session.getSessionAsYAML();

  return {
    appleId: authState.username,
    appleIdPassword: authState.password,
    team: {
      id: team.teamId,
      name: `${team.name} (${team.type})`,
      inHouse: team.type.toLowerCase() === 'in-house',
    },
    authState,
    fastlaneSession,
  };
}

/**
 * Authenticate with API Key.
 */
export async function authenticateWithApiKeyAsync(
  apiKey: ApiKeyAuthConfig,
  teamId?: string,
): Promise<ApiKeyAuthContext> {
  const token = new Token({
    key: apiKey.keyP8,
    issuerId: apiKey.issuerId,
    keyId: apiKey.keyId,
    duration: 1200, // 20 minutes
  });

  return {
    team: {
      id: teamId || '',
      inHouse: false,
    },
    authState: {
      context: { token },
    },
    ascApiKey: apiKey,
  };
}

/**
 * Check if API Key environment variables are set.
 */
export function hasApiKeyEnvVars(): boolean {
  return !!(
    process.env.EXPO_ASC_API_KEY_PATH ||
    process.env.EXPO_ASC_KEY_ID ||
    process.env.EXPO_ASC_ISSUER_ID ||
    process.env.CLIX_ASC_API_KEY_PATH ||
    process.env.CLIX_ASC_KEY_ID ||
    process.env.CLIX_ASC_ISSUER_ID
  );
}

/**
 * Check if Apple ID environment variables are set.
 */
export function hasAppleIdEnvVars(): boolean {
  return !!(process.env.EXPO_APPLE_ID || process.env.CLIX_APPLE_ID);
}

/**
 * Get API Key from environment variables.
 */
export async function getApiKeyFromEnvAsync(): Promise<ApiKeyAuthConfig | null> {
  const keyPath = process.env.EXPO_ASC_API_KEY_PATH || process.env.CLIX_ASC_API_KEY_PATH;
  const keyId = process.env.EXPO_ASC_KEY_ID || process.env.CLIX_ASC_KEY_ID;
  const issuerId = process.env.EXPO_ASC_ISSUER_ID || process.env.CLIX_ASC_ISSUER_ID;

  if (!keyPath && !keyId && !issuerId) {
    return null;
  }

  if (!keyPath || !keyId || !issuerId) {
    throw new Error(
      'Incomplete API Key configuration. Please provide all of: API Key Path, Key ID, and Issuer ID.',
    );
  }

  if (!fs.existsSync(keyPath)) {
    throw new Error(`API Key file not found: ${keyPath}`);
  }

  const keyP8 = fs.readFileSync(keyPath, 'utf-8');
  return { keyId, issuerId, keyP8 };
}

/**
 * Get Apple ID from environment variables.
 */
export function getAppleIdFromEnv(): string | null {
  return process.env.EXPO_APPLE_ID || process.env.CLIX_APPLE_ID || null;
}

/**
 * Remove control characters (ASCII 0-31) from a string.
 * Used to sanitize user input that may contain unprintable characters.
 */
function removeControlCharacters(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32) {
      result += str[i];
    }
  }
  return result;
}
