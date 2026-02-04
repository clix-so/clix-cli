/**
 * Tests for P8 file validation utilities.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  extractKeyIdFromFilename,
  getKeyIdError,
  getTeamIdError,
  validateKeyId,
  validateP8File,
  validateTeamId,
} from '../p8-validator';

describe('p8-validator', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateP8File', () => {
    test('should validate a valid P8 file', () => {
      const validP8Content = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----`;
      const filePath = path.join(tempDir, 'AuthKey_ABCD123456.p8');
      fs.writeFileSync(filePath, validP8Content);

      const result = validateP8File(filePath);
      expect(result.valid).toBe(true);
      expect(result.content).toBe(validP8Content);
      expect(result.suggestedKeyId).toBe('ABCD123456');
    });

    test('should return error for non-existent file', () => {
      const result = validateP8File('/nonexistent/path/file.p8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('should return error for invalid file format (missing BEGIN)', () => {
      const invalidContent = `-----END PRIVATE KEY-----`;
      const filePath = path.join(tempDir, 'invalid-begin.p8');
      fs.writeFileSync(filePath, invalidContent);

      const result = validateP8File(filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid P8 file format');
    });

    test('should return error for invalid file format (missing END)', () => {
      const invalidContent = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...`;
      const filePath = path.join(tempDir, 'invalid-end.p8');
      fs.writeFileSync(filePath, invalidContent);

      const result = validateP8File(filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Private key is incomplete');
    });

    test('should handle ~ expansion in path', () => {
      // This test ensures the ~ is handled, even if it returns an error for the path
      const result = validateP8File('~/nonexistent.p8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });

  describe('extractKeyIdFromFilename', () => {
    test('should extract Key ID from AuthKey_XXXXXXXXXX.p8 format', () => {
      expect(extractKeyIdFromFilename('AuthKey_ABCD123456.p8')).toBe('ABCD123456');
    });

    test('should handle lowercase extension', () => {
      expect(extractKeyIdFromFilename('AuthKey_ABCD123456.P8')).toBe('ABCD123456');
    });

    test('should return null for non-matching filename', () => {
      expect(extractKeyIdFromFilename('my-key.p8')).toBeNull();
    });

    test('should return null for wrong Key ID length', () => {
      expect(extractKeyIdFromFilename('AuthKey_ABC.p8')).toBeNull();
    });

    test('should return null for non-p8 file', () => {
      expect(extractKeyIdFromFilename('AuthKey_ABCD123456.txt')).toBeNull();
    });
  });

  describe('validateKeyId', () => {
    test('should validate 10 character alphanumeric Key ID', () => {
      expect(validateKeyId('ABCD123456')).toBe(true);
    });

    test('should reject Key ID shorter than 10 characters', () => {
      expect(validateKeyId('ABC123')).toBe(false);
    });

    test('should reject Key ID longer than 10 characters', () => {
      expect(validateKeyId('ABCD12345678')).toBe(false);
    });

    test('should reject Key ID with special characters', () => {
      expect(validateKeyId('ABCD!@#$56')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(validateKeyId('abcd123456')).toBe(true);
    });
  });

  describe('validateTeamId', () => {
    test('should validate 10 character alphanumeric Team ID', () => {
      expect(validateTeamId('TEAMID1234')).toBe(true);
    });

    test('should reject Team ID shorter than 10 characters', () => {
      expect(validateTeamId('TEAM')).toBe(false);
    });

    test('should reject Team ID longer than 10 characters', () => {
      expect(validateTeamId('TEAMID123456')).toBe(false);
    });
  });

  describe('getKeyIdError', () => {
    test('should return error for empty Key ID', () => {
      expect(getKeyIdError('')).toBe('Key ID is required');
    });

    test('should return error for invalid format', () => {
      expect(getKeyIdError('ABC')).toBe('Key ID must be 10 alphanumeric characters');
    });

    test('should return null for valid Key ID', () => {
      expect(getKeyIdError('ABCD123456')).toBeNull();
    });
  });

  describe('getTeamIdError', () => {
    test('should return error for empty Team ID', () => {
      expect(getTeamIdError('')).toBe('Team ID is required');
    });

    test('should return error for invalid format', () => {
      expect(getTeamIdError('TEAM')).toBe('Team ID must be 10 alphanumeric characters');
    });

    test('should return null for valid Team ID', () => {
      expect(getTeamIdError('TEAMID1234')).toBeNull();
    });
  });
});
