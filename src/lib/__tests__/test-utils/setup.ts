import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Test environment configuration
 */
export interface TestEnvironment {
  testDir: string;
  configDir: string;
  cleanup: () => Promise<void>;
  writeConfig: (filename: string, content: string) => Promise<string>;
  readConfig: (filename: string) => Promise<string>;
}

/**
 * Creates an isolated test environment with a temporary directory
 * that acts as the user's home directory during tests.
 */
export async function createTestEnvironment(): Promise<TestEnvironment> {
  const testDir = join(tmpdir(), `clix-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const configDir = join(testDir, '.config', 'clix');

  await mkdir(testDir, { recursive: true });
  await mkdir(configDir, { recursive: true });

  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalXdgStateHome = process.env.XDG_STATE_HOME;

  process.env.HOME = testDir;
  process.env.XDG_CONFIG_HOME = join(testDir, '.config');
  process.env.XDG_STATE_HOME = join(testDir, '.local', 'state');

  return {
    testDir,
    configDir,
    cleanup: async () => {
      process.env.HOME = originalHome;
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      process.env.XDG_STATE_HOME = originalXdgStateHome;
      await rm(testDir, { recursive: true, force: true });
    },
    writeConfig: async (filename: string, content: string) => {
      const filepath = join(configDir, filename);
      await writeFile(filepath, content, 'utf-8');
      return filepath;
    },
    readConfig: async (filename: string) => {
      const filepath = join(configDir, filename);
      return readFile(filepath, 'utf-8');
    },
  };
}

/**
 * Creates a temporary file with the given content
 */
export async function createTempFile(
  filename: string,
  content: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const tempDir = join(tmpdir(), `clix-temp-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  const filepath = join(tempDir, filename);
  await writeFile(filepath, content, 'utf-8');

  return {
    path: filepath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Captures console output during test execution
 */
export function captureConsole(): {
  logs: string[];
  errors: string[];
  warns: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => logs.push(args.map(String).join(' '));
  console.error = (...args) => errors.push(args.map(String).join(' '));
  console.warn = (...args) => warns.push(args.map(String).join(' '));

  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

/**
 * Creates a mock process.env for testing
 */
export function mockEnv(overrides: Record<string, string | undefined>): () => void {
  const original: Record<string, string | undefined> = {};

  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  return () => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  };
}

/**
 * Asserts that an async function throws an error with optional message matching
 */
export async function expectAsyncError(
  fn: () => Promise<unknown>,
  messageMatch?: string | RegExp,
): Promise<Error> {
  let caught: Error | null = null;

  try {
    await fn();
  } catch (e) {
    caught = e as Error;
  }

  if (!caught) {
    throw new Error('Expected function to throw an error');
  }

  if (messageMatch) {
    if (typeof messageMatch === 'string') {
      if (!caught.message.includes(messageMatch)) {
        throw new Error(
          `Expected error message to include "${messageMatch}", got "${caught.message}"`,
        );
      }
    } else if (!messageMatch.test(caught.message)) {
      throw new Error(`Expected error message to match ${messageMatch}, got "${caught.message}"`);
    }
  }

  return caught;
}
