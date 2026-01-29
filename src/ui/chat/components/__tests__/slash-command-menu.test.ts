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

  test('embedded skills are hidden from menu (advanced features)', () => {
    // All embedded skills (from @clix-so/clix-agent-skills) are hidden from the menu
    // because they overlap with /install or are advanced features.
    // They're still accessible by typing them directly.
    const nonLocalSkill = getAvailableSkills().find((s) => !s.isLocal);
    if (!nonLocalSkill) return;

    const cmd = getSlashCommands().find((c) => c.command === nonLocalSkill.type);
    // Embedded skills should NOT appear in the menu (they are hidden)
    expect(cmd).toBeUndefined();
  });

  test('visible local skills are marked as system category', () => {
    // Find a visible local skill (install, doctor are visible; ios-setup is hidden)
    const localSkills = getAvailableSkills().filter((s) => s.isLocal);
    const visibleLocalSkill = localSkills.find((s) => s.type === 'install' || s.type === 'doctor');
    if (!visibleLocalSkill) return;

    const cmd = getSlashCommands().find((c) => c.command === visibleLocalSkill.type);
    expect(cmd).toBeDefined();
    expect(cmd?.category).toBe('system');
  });
});
