import { describe, expect, test } from 'bun:test';
import {
  EMBEDDED_SKILLS,
  getEmbeddedSkill,
  getEmbeddedSkillFolders,
  hasEmbeddedSkills,
} from '../embedded-skills';

describe('embedded-skills (local prompts only)', () => {
  test('contains embedded local prompts', () => {
    expect(hasEmbeddedSkills()).toBe(true);
    expect(EMBEDDED_SKILLS['local-install']).toBeDefined();
    expect(EMBEDDED_SKILLS['local-doctor']).toBeDefined();
  });

  test('returns embedded prompt by folder key', () => {
    const installPrompt = getEmbeddedSkill('local-install');
    expect(installPrompt).toBeDefined();
    expect(installPrompt).toContain('Integration Workflow');
  });

  test('returns all embedded prompt keys', () => {
    const folders = getEmbeddedSkillFolders();
    expect(folders).toContain('local-install');
    expect(folders).toContain('local-doctor');
  });
});
