import { describe, expect, test } from 'bun:test';
import {
  EMBEDDED_SKILL_METADATA,
  EMBEDDED_SKILLS,
  getEmbeddedSkill,
  getEmbeddedSkillFolders,
  getSkillMetadataByCommand,
  getSkillMetadataByFolder,
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
    expect(installPrompt).toContain('Install phase');
  });

  test('returns all embedded prompt keys', () => {
    const folders = getEmbeddedSkillFolders();
    expect(folders).toContain('local-install');
    expect(folders).toContain('local-doctor');
  });

  test('package metadata list stays empty', () => {
    expect(EMBEDDED_SKILL_METADATA).toEqual([]);
    expect(getSkillMetadataByCommand('integration')).toBeUndefined();
    expect(getSkillMetadataByFolder('integration')).toBeUndefined();
  });
});
