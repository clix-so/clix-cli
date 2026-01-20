import { describe, expect, test } from 'bun:test';

import { getCommands } from '@/lib/commands';
import { getAvailableSkills } from '@/lib/skills';
import { getFilteredCommands, getSlashCommands } from '../SlashCommandMenu';

describe('SlashCommandMenu command list', () => {
  test('stays in sync with the command registry (canonical names only)', () => {
    const registryNames = getCommands()
      .filter((c) => !c.isHidden)
      .map((c) => c.name)
      .sort();

    const menuNames = getSlashCommands()
      .map((c) => c.command)
      .sort();

    expect(menuNames).toEqual(registryNames);
  });

  test('filters commands by prefix', () => {
    const filtered = getFilteredCommands('re').map((c) => c.command);
    expect(filtered).toContain('resume');
  });

  test('does not include aliases in menu', () => {
    const menuNames = getSlashCommands().map((c) => c.command);
    expect(menuNames).not.toContain('clear');
  });

  test('marks embedded skills as skill category', () => {
    const nonLocalSkill = getAvailableSkills().find((s) => !s.isLocal);
    if (!nonLocalSkill) return;

    const cmd = getSlashCommands().find((c) => c.command === nonLocalSkill.type);
    expect(cmd).toBeDefined();
    expect(cmd?.category).toBe('skill');
  });

  test('marks local skills as system category', () => {
    const localSkill = getAvailableSkills().find((s) => s.isLocal);
    if (!localSkill) return;

    const cmd = getSlashCommands().find((c) => c.command === localSkill.type);
    expect(cmd).toBeDefined();
    expect(cmd?.category).toBe('system');
  });
});
