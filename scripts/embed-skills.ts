#!/usr/bin/env bun
/**
 * Embed local command prompts into src/lib/embedded-skills.ts.
 *
 * This script intentionally embeds only local prompts (install/doctor),
 * not external package-based skills.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_FILE = './src/lib/embedded-skills.ts';
const LOCAL_SKILLS_DIR = './src/lib/skills';

function discoverLocalSkillFolders(): string[] {
  if (!existsSync(LOCAL_SKILLS_DIR)) {
    return [];
  }

  return readdirSync(LOCAL_SKILLS_DIR).filter((entry) => {
    const entryPath = join(LOCAL_SKILLS_DIR, entry);
    const skillMdPath = join(entryPath, 'SKILL.md');
    return statSync(entryPath).isDirectory() && existsSync(skillMdPath);
  });
}

function readLocalSkill(folder: string): string | null {
  const skillPath = join(LOCAL_SKILLS_DIR, folder, 'SKILL.md');
  if (!existsSync(skillPath)) {
    return null;
  }
  return readFileSync(skillPath, 'utf-8');
}

function escapeTemplateString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function generateEmbeddedSkillsFile(skills: Record<string, string>): string {
  const skillEntries = Object.entries(skills)
    .map(([key, content]) => `  '${key}': \`${escapeTemplateString(content)}\`,`)
    .join('\n');

  return `/**
 * Auto-generated file containing embedded command prompts.
 * DO NOT EDIT MANUALLY - regenerate with: bun scripts/embed-skills.ts
 *
 * Only local command prompts are embedded.
 */

/**
 * Skill metadata interface kept for backward compatibility.
 */
export interface SkillMetadata {
  folder: string;
  name: string;
  commandName: string;
  displayName: string;
  shortDescription: string;
  description: string;
  userInvocable: boolean;
}

/**
 * Embedded prompt content by folder name.
 */
export const EMBEDDED_SKILLS: Record<string, string> = {
${skillEntries}
};

/**
 * Package-based metadata is intentionally empty.
 */
export const EMBEDDED_SKILL_METADATA: SkillMetadata[] = [];

export function hasEmbeddedSkills(): boolean {
  return Object.keys(EMBEDDED_SKILLS).length > 0;
}

export function getEmbeddedSkill(skillFolder: string): string | undefined {
  return EMBEDDED_SKILLS[skillFolder];
}

export function getEmbeddedSkillFolders(): string[] {
  return Object.keys(EMBEDDED_SKILLS);
}

export function getEmbeddedSkillMetadata(): SkillMetadata[] {
  return EMBEDDED_SKILL_METADATA;
}

export function getSkillMetadataByCommand(_commandName: string): SkillMetadata | undefined {
  return undefined;
}

export function getSkillMetadataByFolder(_folder: string): SkillMetadata | undefined {
  return undefined;
}
`;
}

async function main() {
  console.log('Embedding local command prompts...');

  const localFolders = discoverLocalSkillFolders();
  if (localFolders.length === 0) {
    console.error('No local skill folders found under src/lib/skills');
    process.exit(1);
  }

  const skills: Record<string, string> = {};

  for (const folder of localFolders) {
    const content = readLocalSkill(folder);
    if (!content) {
      console.warn(`Skipped local skill folder without SKILL.md: ${folder}`);
      continue;
    }

    const key = `local-${folder}`;
    skills[key] = content;
    console.log(`  Embedded: ${folder} (local)`);
  }

  const generated = generateEmbeddedSkillsFile(skills);
  writeFileSync(OUTPUT_FILE, generated, 'utf-8');

  console.log('');
  console.log(`Created: ${OUTPUT_FILE}`);
  console.log(`Embedded ${Object.keys(skills).length} local prompts.`);
}

main().catch((error) => {
  console.error('Failed to embed local prompts:', error);
  process.exit(1);
});
