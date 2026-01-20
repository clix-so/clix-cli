/**
 * Tests for embedded skills to ensure build-time skill embedding works correctly.
 *
 * These tests validate that:
 * 1. All required skills are embedded
 * 2. Embedded skills contain valid content
 * 3. The embedding matches the expected skill folder structure
 */
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

/**
 * Required skill folders that MUST be embedded for the binary to work.
 * This must match SKILL_FOLDER_MAP in skills.ts
 */
const REQUIRED_SKILL_FOLDERS = [
  'integration',
  'event-tracking',
  'user-management',
  'personalization',
];

describe('embedded-skills', () => {
  describe('build-time embedding validation', () => {
    test('hasEmbeddedSkills returns true when skills are embedded', () => {
      expect(hasEmbeddedSkills()).toBe(true);
    });

    test('all required skills are embedded', () => {
      const embeddedFolders = getEmbeddedSkillFolders();

      for (const folder of REQUIRED_SKILL_FOLDERS) {
        expect(embeddedFolders).toContain(folder);
      }
    });

    test('EMBEDDED_SKILLS contains all required skills', () => {
      for (const folder of REQUIRED_SKILL_FOLDERS) {
        expect(EMBEDDED_SKILLS[folder]).toBeDefined();
        expect(typeof EMBEDDED_SKILLS[folder]).toBe('string');
        expect(EMBEDDED_SKILLS[folder].length).toBeGreaterThan(0);
      }
    });

    test('embedded skills count includes at least required skills', () => {
      // May have additional skills beyond the required ones
      expect(Object.keys(EMBEDDED_SKILLS).length).toBeGreaterThanOrEqual(
        REQUIRED_SKILL_FOLDERS.length,
      );
    });
  });

  describe('getEmbeddedSkill', () => {
    test('returns skill content for valid folder', () => {
      const skill = getEmbeddedSkill('integration');
      expect(skill).toBeDefined();
      expect(typeof skill).toBe('string');
      expect(skill?.length).toBeGreaterThan(0);
    });

    test('returns undefined for invalid folder', () => {
      const skill = getEmbeddedSkill('non-existent-skill');
      expect(skill).toBeUndefined();
    });

    test('returns correct content for each skill type', () => {
      // Each skill should have a recognizable marker in its content
      const skillMarkers: Record<string, string> = {
        integration: 'clix-integration',
        'event-tracking': 'clix-event-tracking',
        'user-management': 'clix-user-management',
        personalization: 'clix-personalization',
      };

      for (const [folder, marker] of Object.entries(skillMarkers)) {
        const skill = getEmbeddedSkill(folder);
        expect(skill).toBeDefined();
        expect(skill).toContain(marker);
      }
    });
  });

  describe('skill content validation', () => {
    test('integration skill contains SDK integration content', () => {
      const skill = getEmbeddedSkill('integration');
      expect(skill).toContain('SDK');
      expect(skill).toContain('integration');
    });

    test('event-tracking skill contains event tracking content', () => {
      const skill = getEmbeddedSkill('event-tracking');
      expect(skill).toContain('trackEvent');
    });

    test('user-management skill contains user management content', () => {
      const skill = getEmbeddedSkill('user-management');
      expect(skill).toContain('setUserId');
    });

    test('personalization skill contains personalization content', () => {
      const skill = getEmbeddedSkill('personalization');
      expect(skill).toContain('personalization');
    });
  });

  describe('getEmbeddedSkillFolders', () => {
    test('returns array of folder names', () => {
      const folders = getEmbeddedSkillFolders();
      expect(Array.isArray(folders)).toBe(true);
      expect(folders.length).toBeGreaterThanOrEqual(REQUIRED_SKILL_FOLDERS.length);
    });

    test('includes all required skill folders', () => {
      const folders = getEmbeddedSkillFolders();
      for (const required of REQUIRED_SKILL_FOLDERS) {
        expect(folders).toContain(required);
      }
    });

    test('folder names match EMBEDDED_SKILLS keys', () => {
      const folders = getEmbeddedSkillFolders();
      const keys = Object.keys(EMBEDDED_SKILLS);
      expect(folders.sort()).toEqual(keys.sort());
    });
  });
});

describe('embedded skill metadata', () => {
  /**
   * Tests for dynamic skill discovery via EMBEDDED_SKILL_METADATA.
   * This is critical for automatic command registration when new skills are added.
   */

  describe('EMBEDDED_SKILL_METADATA structure', () => {
    test('contains metadata for all package skills', () => {
      // Filter out local skills (prefixed with 'local-') as they don't have metadata
      const packageSkills = Object.keys(EMBEDDED_SKILLS).filter((key) => !key.startsWith('local-'));
      expect(EMBEDDED_SKILL_METADATA.length).toBe(packageSkills.length);
    });

    test('each metadata entry has all required fields', () => {
      for (const meta of EMBEDDED_SKILL_METADATA) {
        expect(meta.folder).toBeDefined();
        expect(meta.name).toBeDefined();
        expect(meta.description).toBeDefined();
        expect(typeof meta.userInvocable).toBe('boolean');
        expect(meta.commandName).toBeDefined();
        expect(meta.displayName).toBeDefined();
      }
    });

    test('metadata folders match package skill keys', () => {
      const metadataFolders = EMBEDDED_SKILL_METADATA.map((m) => m.folder).sort();
      // Filter out local skills (prefixed with 'local-') as they don't have metadata
      const packageSkills = Object.keys(EMBEDDED_SKILLS)
        .filter((key) => !key.startsWith('local-'))
        .sort();
      expect(metadataFolders).toEqual(packageSkills);
    });

    test('all embedded skills are user-invocable', () => {
      // All skills in EMBEDDED_SKILL_METADATA should be user-invocable
      // (non-user-invocable skills are filtered out during embedding)
      for (const meta of EMBEDDED_SKILL_METADATA) {
        expect(meta.userInvocable).toBe(true);
      }
    });
  });

  describe('getSkillMetadataByCommand', () => {
    test('returns metadata for valid command name', () => {
      const meta = getSkillMetadataByCommand('integration');
      expect(meta).toBeDefined();
      expect(meta?.commandName).toBe('integration');
      expect(meta?.folder).toBe('integration');
    });

    test('returns undefined for invalid command name', () => {
      const meta = getSkillMetadataByCommand('non-existent');
      expect(meta).toBeUndefined();
    });

    test('works for all embedded skills', () => {
      for (const skill of EMBEDDED_SKILL_METADATA) {
        const meta = getSkillMetadataByCommand(skill.commandName);
        expect(meta).toBeDefined();
        expect(meta?.folder).toBe(skill.folder);
      }
    });
  });

  describe('getSkillMetadataByFolder', () => {
    test('returns metadata for valid folder name', () => {
      const meta = getSkillMetadataByFolder('integration');
      expect(meta).toBeDefined();
      expect(meta?.folder).toBe('integration');
      expect(meta?.commandName).toBe('integration');
    });

    test('returns undefined for invalid folder name', () => {
      const meta = getSkillMetadataByFolder('non-existent');
      expect(meta).toBeUndefined();
    });

    test('works for all package skills', () => {
      // Filter out local skills (prefixed with 'local-') as they don't have metadata
      const packageSkills = Object.keys(EMBEDDED_SKILLS).filter((key) => !key.startsWith('local-'));
      for (const folder of packageSkills) {
        const meta = getSkillMetadataByFolder(folder);
        expect(meta).toBeDefined();
        expect(meta?.folder).toBe(folder);
      }
    });

    test('returns undefined for local skills', () => {
      // Local skills don't have metadata
      const meta = getSkillMetadataByFolder('local-install');
      expect(meta).toBeUndefined();
    });
  });
});

describe('dynamic skill discovery', () => {
  /**
   * Tests verifying that new skills from @clix-so/clix-agent-skills
   * are automatically discovered and available.
   */

  test('api-triggered-campaigns skill is discovered', () => {
    // This skill was added after the initial implementation
    // and should be automatically discovered
    const folders = getEmbeddedSkillFolders();
    expect(folders).toContain('api-triggered-campaigns');
  });

  test('api-triggered-campaigns has valid metadata', () => {
    const meta = getSkillMetadataByFolder('api-triggered-campaigns');
    expect(meta).toBeDefined();
    expect(meta?.commandName).toBe('api-triggered-campaigns');
    expect(meta?.displayName).toBe('API-Triggered Campaigns');
    expect(meta?.userInvocable).toBe(true);
  });

  test('api-triggered-campaigns is accessible via getEmbeddedSkill', () => {
    const skill = getEmbeddedSkill('api-triggered-campaigns');
    expect(skill).toBeDefined();
    expect(typeof skill).toBe('string');
    expect(skill?.length).toBeGreaterThan(0);
  });

  test('new skills result in automatic command availability', async () => {
    // Import skills.ts to verify dynamic command availability
    const { getAvailableSkills } = await import('../skills');
    const skills = getAvailableSkills();

    // api-triggered-campaigns command should be available
    const apiCampaign = skills.find((s) => s.type === 'api-triggered-campaigns');
    expect(apiCampaign).toBeDefined();
    expect(apiCampaign?.name).toBe('API-Triggered Campaigns');
  });
});

describe('skills.ts integration with embedded skills', () => {
  /**
   * These tests verify that skills.ts correctly falls back to embedded skills.
   * Since we're in the dev environment, the external package is available,
   * but we can still verify the fallback logic works.
   */

  test('all skill types resolve to valid prompts', async () => {
    // Import the skill folder map from skills.ts indirectly through getSkillPrompt
    const { getSkillPrompt, getAvailableSkillTypes } = await import('../skills');

    // Get all available skill types dynamically
    const skillTypes = getAvailableSkillTypes();

    // Each skill type should resolve to a skill (either from package or embedded)
    for (const skillType of skillTypes) {
      const prompt = await getSkillPrompt(skillType);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  test('embedded skill count matches command count (excluding local skills)', async () => {
    const { getAvailableSkills } = await import('../skills');
    const skills = getAvailableSkills();

    // Embedded skills + local skills = total available skills
    const embeddedCount = EMBEDDED_SKILL_METADATA.length;
    const localSkillCount = skills.filter((s) => s.isLocal).length;

    expect(skills.length).toBe(embeddedCount + localSkillCount);
  });
});
