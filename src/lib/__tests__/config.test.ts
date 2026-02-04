import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Config, ConfigManager, DEFAULT_CONFIG, resetConfigManager } from '../config/index';
import { resetCoreEvents } from '../events/core-events';

describe('ConfigManager', () => {
  let testDir: string;
  let configDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `clix-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    configDir = join(testDir, '.config', 'clix');
    await mkdir(configDir, { recursive: true });

    // Reset singletons for clean tests
    resetConfigManager();
    resetCoreEvents();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    resetConfigManager();
  });

  test('should return default config when no config file exists', async () => {
    const manager = new ConfigManager(configDir);
    const config = await manager.load();

    expect(config.selectedAgent).toBe('');
    expect(config.version).toBe(5);
    expect(config.ui).toBeDefined();
    expect(config.ui.streaming).toBe(true);
  });

  test('should save and load config correctly', async () => {
    const manager = new ConfigManager(configDir);
    const updates: Partial<Config> = { selectedAgent: 'claude' };

    await manager.save(updates);
    const loaded = await manager.load();

    expect(loaded.selectedAgent).toBe('claude');
  });

  test('should save and load config with lastUsedAt', async () => {
    const manager = new ConfigManager(configDir);
    const timestamp = new Date().toISOString();
    const updates: Partial<Config> = {
      selectedAgent: 'codex',
      lastUsedAt: timestamp,
    };

    await manager.save(updates);
    const loaded = await manager.load();

    expect(loaded.selectedAgent).toBe('codex');
    expect(loaded.lastUsedAt).toBe(timestamp);
  });

  test('should migrate old selectedCLI to selectedAgent', async () => {
    const configPath = join(configDir, 'config.json');

    // Write old config format
    await writeFile(configPath, JSON.stringify({ selectedCLI: 'claude', version: 1 }));

    const manager = new ConfigManager(configDir);
    const config = await manager.load();

    expect(config.selectedAgent).toBe('claude');
    expect(config.version).toBe(5);
  });

  test('should create config directory if it does not exist', async () => {
    const newConfigDir = join(testDir, 'new-clix-config');
    const manager = new ConfigManager(newConfigDir);
    const path = await manager.getConfigPath();

    expect(path).toContain('config.json');
    expect(manager.configDir).toBe(newConfigDir);
  });

  test('should handle invalid JSON by throwing ConfigError', async () => {
    const configPath = join(configDir, 'config.json');
    await writeFile(configPath, 'invalid json');

    const manager = new ConfigManager(configDir);

    // Should throw ConfigError for invalid JSON
    await expect(manager.load()).rejects.toThrow('Invalid JSON');
  });

  test('should merge partial updates with existing config', async () => {
    const manager = new ConfigManager(configDir);

    // Initial save
    await manager.save({ selectedAgent: 'claude' });

    // Partial update
    await manager.save({ ui: { streaming: false } });

    const loaded = await manager.load();

    expect(loaded.selectedAgent).toBe('claude');
    expect(loaded.ui.streaming).toBe(false);
    expect(loaded.ui.showTimestamps).toBe(false); // default value preserved
  });

  test('should get and set individual config values', async () => {
    const manager = new ConfigManager(configDir);

    await manager.set('selectedAgent', 'claude');
    const agent = await manager.get('selectedAgent');

    expect(agent).toBe('claude');
  });

  test('should reset config to defaults', async () => {
    const manager = new ConfigManager(configDir);

    await manager.save({ selectedAgent: 'claude' });
    await manager.reset();

    const config = await manager.load();

    expect(config.selectedAgent).toBe('');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test('should validate config schema on save', async () => {
    const manager = new ConfigManager(configDir);

    // Invalid UI theme should fail validation
    await expect(manager.save({ ui: { theme: 'invalid-theme' as 'auto' } })).rejects.toThrow();
  });

  test('should cache config after first load', async () => {
    const manager = new ConfigManager(configDir);

    await manager.save({ selectedAgent: 'claude' });

    // First load
    await manager.load();

    // Modify file directly (simulating external change)
    const configPath = join(configDir, 'config.json');
    await writeFile(configPath, JSON.stringify({ ...DEFAULT_CONFIG, selectedAgent: 'codex' }));

    // Second load should return cached value
    const cached = await manager.load();
    expect(cached.selectedAgent).toBe('claude');

    // Clear cache and reload
    manager.clearCache();
    const reloaded = await manager.load();
    expect(reloaded.selectedAgent).toBe('codex');
  });
});
