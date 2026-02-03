/**
 * macOS Keychain integration for secure credential storage.
 * Based on EAS CLI implementation.
 *
 * @module ios/keychain
 */

import keychain from 'keychain';

const KEYCHAIN_TYPE = 'internet';
const NO_PASSWORD_REGEX = /Could not find password/;
const IS_MAC = process.platform === 'darwin';

/**
 * Environment variable to disable keychain functionality.
 * When set, passwords will be skipped and existing ones deleted.
 */
export const CLIX_NO_KEYCHAIN = process.env.CLIX_NO_KEYCHAIN;

export interface KeychainCredentials {
  serviceName: string;
  username: string;
  password: string;
}

/**
 * Delete a password from the macOS Keychain.
 */
export async function deletePasswordAsync({
  username,
  serviceName,
}: Pick<KeychainCredentials, 'username' | 'serviceName'>): Promise<boolean> {
  if (!IS_MAC) {
    return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    keychain.deletePassword(
      { account: username, service: serviceName, type: KEYCHAIN_TYPE },
      (error: Error) => {
        if (error) {
          if (NO_PASSWORD_REGEX.test(error.message)) {
            resolve(false);
            return;
          }
          reject(error);
        } else {
          resolve(true);
        }
      },
    );
  });
}

/**
 * Get a password from the macOS Keychain.
 */
export async function getPasswordAsync({
  username,
  serviceName,
}: Pick<KeychainCredentials, 'serviceName' | 'username'>): Promise<string | null> {
  if (!IS_MAC || CLIX_NO_KEYCHAIN) {
    return null;
  }

  return new Promise((resolve, reject) => {
    keychain.getPassword(
      { account: username, service: serviceName, type: KEYCHAIN_TYPE },
      (error: Error, password?: string) => {
        if (error) {
          if (NO_PASSWORD_REGEX.test(error.message)) {
            resolve(null);
            return;
          }
          reject(error);
        } else {
          resolve(password ?? null);
        }
      },
    );
  });
}

/**
 * Store a password in the macOS Keychain.
 */
export async function setPasswordAsync({
  serviceName,
  username,
  password,
}: KeychainCredentials): Promise<boolean> {
  if (!IS_MAC || CLIX_NO_KEYCHAIN) {
    return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    keychain.setPassword(
      { account: username, service: serviceName, password, type: KEYCHAIN_TYPE },
      (error: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      },
    );
  });
}

/**
 * Get the keychain service name for Apple ID credentials.
 * Uses the same format as Fastlane for potential interoperability.
 */
export function getAppleKeychainServiceName(appleId: string): string {
  return `deliver.${appleId}`;
}

/**
 * Check if keychain functionality is available.
 */
export function isKeychainAvailable(): boolean {
  return IS_MAC && !CLIX_NO_KEYCHAIN;
}
