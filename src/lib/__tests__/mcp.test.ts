import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCPInstaller } from '../mcp';

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command], { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

describe('MCPInstaller', () => {
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    testDir = join(tmpdir(), `clix-mcp-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    originalHome = process.env.HOME;
    process.env.HOME = testDir;
  });

  afterEach(async () => {
    if (originalHome) {
      process.env.HOME = originalHome;
    }
    await rm(testDir, { recursive: true, force: true });
  });

  test('should return correct config path for claude', async () => {
    const installer = new MCPInstaller();
    const path = await installer.getMCPConfigPath('claude');

    expect(path).toContain('.config/claude');
    expect(path).toContain('claude_desktop_config.json');
  });

  test('should return correct config path for gemini', async () => {
    const installer = new MCPInstaller();
    const path = await installer.getMCPConfigPath('gemini');

    expect(path).toContain('.config/gemini');
    expect(path).toContain('mcp_config.json');
  });

  test('should return correct config path for aider', async () => {
    const installer = new MCPInstaller();
    const path = await installer.getMCPConfigPath('aider');

    expect(path).toContain('.aider');
    expect(path).toContain('mcp_config.json');
  });

  test('should return false when server is not installed', async () => {
    const installer = new MCPInstaller();
    const isInstalled = await installer.isServerInstalled('claude');

    expect(isInstalled).toBe(false);
  });

  test('should detect installed server', async () => {
    const installer = new MCPInstaller();

    const configPath = await installer.getMCPConfigPath('claude');
    const mockConfig = {
      mcpServers: {
        'clix-mcp-server': {
          command: 'npx',
          args: ['-y', 'https://github.com/clix-so/clix-mcp-server'],
        },
      },
    };

    await writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    const isInstalled = await installer.isServerInstalled('claude');
    expect(isInstalled).toBe(true);
  });

  test('should install server and update config', async () => {
    const installer = new MCPInstaller();

    const npxExists = await commandExists('npx');
    if (!npxExists) {
      console.warn('Skipping test: npx not available');
      return;
    }

    await installer.installServer('claude');

    const configPath = await installer.getMCPConfigPath('claude');
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers['clix-mcp-server']).toBeDefined();
    expect(config.mcpServers['clix-mcp-server'].command).toBe('npx');
  });

  test('should preserve existing config when installing', async () => {
    const installer = new MCPInstaller();

    const configPath = await installer.getMCPConfigPath('claude');
    const existingConfig = {
      mcpServers: {
        'other-server': { command: 'other-command' },
      },
    };

    await writeFile(configPath, JSON.stringify(existingConfig, null, 2));

    const npxExists = await commandExists('npx');
    if (!npxExists) {
      console.warn('Skipping test: npx not available');
      return;
    }

    await installer.installServer('claude');

    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    expect(config.mcpServers['other-server']).toBeDefined();
    expect(config.mcpServers['clix-mcp-server']).toBeDefined();
  });
});
