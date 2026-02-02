/**
 * P8 file validation utilities for APNS keys.
 *
 * @module push/p8-validator
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * P8 file validation result.
 */
export interface P8ValidationResult {
  valid: boolean;
  content?: string;
  suggestedKeyId?: string;
  error?: string;
}

/**
 * Validate a P8 file.
 *
 * @param filePath - Path to the P8 file
 * @returns Validation result
 */
export function validateP8File(filePath: string): P8ValidationResult {
  // Expand ~ to home directory
  const expandedPath = filePath.startsWith('~')
    ? path.join(process.env.HOME || '', filePath.slice(1))
    : filePath;

  // Check file exists
  if (!fs.existsSync(expandedPath)) {
    return {
      valid: false,
      error: `File not found: ${filePath}`,
    };
  }

  // Read file content
  let content: string;
  try {
    content = fs.readFileSync(expandedPath, 'utf-8');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    // Check for macOS permission error
    if (errorMessage.includes('EPERM') || errorMessage.includes('operation not permitted')) {
      return {
        valid: false,
        error:
          `Permission denied: Cannot read file from this location.\n` +
          `  Try copying the file to your project directory:\n` +
          `  cp "${expandedPath}" ./\n` +
          `  Then enter: ./${path.basename(expandedPath)}`,
      };
    }
    return {
      valid: false,
      error: `Failed to read file: ${errorMessage}`,
    };
  }

  // Validate content format
  if (!content.includes('-----BEGIN PRIVATE KEY-----')) {
    return {
      valid: false,
      error: 'Invalid P8 file format. File should contain a private key.',
    };
  }

  if (!content.includes('-----END PRIVATE KEY-----')) {
    return {
      valid: false,
      error: 'Invalid P8 file format. Private key is incomplete.',
    };
  }

  // Try to extract Key ID from filename
  const filename = path.basename(expandedPath);
  const suggestedKeyId = extractKeyIdFromFilename(filename);

  return {
    valid: true,
    content,
    suggestedKeyId: suggestedKeyId || undefined,
  };
}

/**
 * Extract Key ID from Apple's default filename format.
 * Apple names downloaded keys as: AuthKey_XXXXXXXXXX.p8
 *
 * @param filename - Filename to extract from
 * @returns Key ID or null if not found
 */
export function extractKeyIdFromFilename(filename: string): string | null {
  const match = filename.match(/AuthKey_([A-Z0-9]{10})\.p8$/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Validate Key ID format.
 * Key ID should be 10 alphanumeric characters.
 *
 * @param keyId - Key ID to validate
 * @returns True if valid
 */
export function validateKeyId(keyId: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(keyId);
}

/**
 * Validate Team ID format.
 * Team ID should be 10 alphanumeric characters.
 *
 * @param teamId - Team ID to validate
 * @returns True if valid
 */
export function validateTeamId(teamId: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(teamId);
}

/**
 * Get validation error message for Key ID.
 *
 * @param keyId - Key ID to validate
 * @returns Error message or null if valid
 */
export function getKeyIdError(keyId: string): string | null {
  if (!keyId) {
    return 'Key ID is required';
  }
  if (!validateKeyId(keyId)) {
    return 'Key ID must be 10 alphanumeric characters';
  }
  return null;
}

/**
 * Get validation error message for Team ID.
 *
 * @param teamId - Team ID to validate
 * @returns Error message or null if valid
 */
export function getTeamIdError(teamId: string): string | null {
  if (!teamId) {
    return 'Team ID is required';
  }
  if (!validateTeamId(teamId)) {
    return 'Team ID must be 10 alphanumeric characters';
  }
  return null;
}
