#!/usr/bin/env bun
/**
 * Embed skills from @clix-so/clix-agent-skills package into the build.
 * This allows the binary to work without requiring the skills package to be installed.
 *
 * Skills are discovered dynamically by scanning the skills folder and parsing
 * YAML frontmatter from SKILL.md files.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const OUTPUT_FILE = './src/lib/embedded-skills.ts';

/**
 * Skill metadata parsed from SKILL.md frontmatter.
 */
interface SkillMetadata {
  /** Skill folder name (e.g., 'integration', 'event-tracking') */
  folder: string;
  /** Skill name from frontmatter (e.g., 'clix-integration') */
  name: string;
  /** Command name derived from name by removing 'clix-' prefix */
  commandName: string;
  /** Display name from frontmatter (e.g., 'SDK Integration') */
  displayName: string;
  /** Short description for command menus */
  shortDescription: string;
  /** Full description from frontmatter (for agent invocation) */
  description: string;
  /** Whether the skill can be invoked by users */
  userInvocable: boolean;
}

/**
 * Derive command name from skill name by removing 'clix-' prefix.
 */
function deriveCommandName(skillName: string): string {
  return skillName.replace(/^clix-/, '');
}

function getSkillsPackagePath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve('@clix-so/clix-agent-skills/package.json');
    return dirname(packagePath);
  } catch {
    return null;
  }
}

/**
 * Discover all skill folders in the skills directory.
 */
function discoverSkillFolders(packagePath: string): string[] {
  const skillsDir = join(packagePath, 'skills');
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir).filter((entry) => {
    const entryPath = join(skillsDir, entry);
    const skillMdPath = join(entryPath, 'SKILL.md');
    return statSync(entryPath).isDirectory() && existsSync(skillMdPath);
  });
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 */
function parseFrontmatter(content: string): Record<string, string | boolean | undefined> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter: Record<string, string | boolean> = {};
  const lines = frontmatterMatch[1].split('\n');
  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    // Check if line starts a new key
    const keyMatch = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (keyMatch) {
      // Save previous key-value if exists
      if (currentKey) {
        frontmatter[currentKey] = parseValue(currentValue.trim());
      }
      currentKey = keyMatch[1];
      currentValue = keyMatch[2];
    } else if (currentKey && line.startsWith('  ')) {
      // Multi-line value continuation
      currentValue += ` ${line.trim()}`;
    }
  }

  // Save last key-value
  if (currentKey) {
    frontmatter[currentKey] = parseValue(currentValue.trim());
  }

  return frontmatter;
}

/**
 * Parse a YAML value to appropriate type.
 */
function parseValue(value: string): string | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * Read and parse a skill from its folder.
 */
function readSkill(
  packagePath: string,
  folder: string,
): { content: string; metadata: SkillMetadata } | null {
  const skillPath = join(packagePath, 'skills', folder, 'SKILL.md');
  if (!existsSync(skillPath)) {
    console.warn(`Warning: SKILL.md not found in ${folder}`);
    return null;
  }

  const content = readFileSync(skillPath, 'utf-8');
  const frontmatter = parseFrontmatter(content);

  // Check if skill is user-invocable (default to true if not specified)
  const userInvocable = frontmatter['user-invocable'];
  const isUserInvocable =
    userInvocable === true || userInvocable === undefined || userInvocable === '';

  // Skip skills that are explicitly not user-invocable
  if (userInvocable === false) {
    console.log(`  Skipped: ${folder} (not user-invocable)`);
    return null;
  }

  const name = (frontmatter.name as string) || `clix-${folder}`;
  const metadata: SkillMetadata = {
    folder,
    name,
    commandName: deriveCommandName(name),
    displayName: (frontmatter['display-name'] as string) || formatDisplayName(folder),
    shortDescription: (frontmatter['short-description'] as string) || '',
    description: (frontmatter.description as string) || '',
    userInvocable: isUserInvocable,
  };

  return { content, metadata };
}

/**
 * Format a folder name as a display name.
 */
function formatDisplayName(folder: string): string {
  return folder
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeTemplateString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function needsQuoting(key: string): boolean {
  return !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

function generateEmbeddedSkillsFile(
  skills: Record<string, string>,
  metadata: SkillMetadata[],
): string {
  const skillEntries = Object.entries(skills)
    .map(([key, content]) => {
      const formattedKey = needsQuoting(key) ? `'${key}'` : key;
      return `  ${formattedKey}: \`${escapeTemplateString(content)}\`,`;
    })
    .join('\n');

  const metadataEntries = metadata
    .map(
      (m) => `  {
    folder: '${m.folder}',
    name: '${m.name}',
    commandName: '${m.commandName}',
    displayName: '${m.displayName}',
    shortDescription: '${escapeString(m.shortDescription)}',
    description:
      '${escapeString(m.description)}',
    userInvocable: ${m.userInvocable},
  },`,
    )
    .join('\n');

  return `/**
 * Auto-generated file containing embedded skill prompts and metadata.
 * DO NOT EDIT MANUALLY - regenerate with: bun scripts/embed-skills.ts
 *
 * These are embedded at build time from @clix-so/clix-agent-skills package
 * to allow the binary to work without requiring the package to be installed.
 */

/**
 * Skill metadata interface.
 */
export interface SkillMetadata {
  /** Skill folder name (e.g., 'integration', 'event-tracking') */
  folder: string;
  /** Skill name from frontmatter (e.g., 'clix-integration') */
  name: string;
  /** Command name derived from name by removing 'clix-' prefix */
  commandName: string;
  /** Display name from frontmatter (e.g., 'SDK Integration') */
  displayName: string;
  /** Short description for command menus */
  shortDescription: string;
  /** Full description from frontmatter (for agent invocation) */
  description: string;
  /** Whether the skill can be invoked by users */
  userInvocable: boolean;
}

/**
 * Embedded skill content by folder name.
 */
export const EMBEDDED_SKILLS: Record<string, string> = {
${skillEntries}
};

/**
 * Embedded skill metadata.
 */
export const EMBEDDED_SKILL_METADATA: SkillMetadata[] = [
${metadataEntries}
];

/**
 * Check if embedded skills are available.
 */
export function hasEmbeddedSkills(): boolean {
  return Object.keys(EMBEDDED_SKILLS).length > 0;
}

/**
 * Get an embedded skill by folder name.
 */
export function getEmbeddedSkill(skillFolder: string): string | undefined {
  return EMBEDDED_SKILLS[skillFolder];
}

/**
 * Get all embedded skill folder names.
 */
export function getEmbeddedSkillFolders(): string[] {
  return Object.keys(EMBEDDED_SKILLS);
}

/**
 * Get metadata for all embedded skills.
 */
export function getEmbeddedSkillMetadata(): SkillMetadata[] {
  return EMBEDDED_SKILL_METADATA;
}

/**
 * Get metadata for a specific skill by command name.
 */
export function getSkillMetadataByCommand(commandName: string): SkillMetadata | undefined {
  return EMBEDDED_SKILL_METADATA.find((m) => m.commandName === commandName);
}

/**
 * Get metadata for a specific skill by folder name.
 */
export function getSkillMetadataByFolder(folder: string): SkillMetadata | undefined {
  return EMBEDDED_SKILL_METADATA.find((m) => m.folder === folder);
}
`;
}

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, ' ');
}

/**
 * Discover local skill folders in src/lib/skills directory.
 */
function discoverLocalSkillFolders(): string[] {
  const localSkillsDir = './src/lib/skills';
  if (!existsSync(localSkillsDir)) {
    return [];
  }

  return readdirSync(localSkillsDir).filter((entry) => {
    const entryPath = join(localSkillsDir, entry);
    const skillMdPath = join(entryPath, 'SKILL.md');
    return statSync(entryPath).isDirectory() && existsSync(skillMdPath);
  });
}

/**
 * Read a local skill from src/lib/skills directory.
 */
function readLocalSkill(folder: string): { content: string; folder: string } | null {
  const skillPath = join('./src/lib/skills', folder, 'SKILL.md');
  if (!existsSync(skillPath)) {
    console.warn(`Warning: SKILL.md not found in ${folder}`);
    return null;
  }

  const content = readFileSync(skillPath, 'utf-8');
  return { content, folder };
}

async function main() {
  console.log('Embedding skills from @clix-so/clix-agent-skills...');

  const packagePath = getSkillsPackagePath();
  if (!packagePath) {
    console.error('ERROR: Skills package not found. Cannot embed skills.');
    console.error('Please install the package: npm install @clix-so/clix-agent-skills');
    process.exit(1);
  }

  console.log(`Found skills package at: ${packagePath}`);

  // Discover all skill folders
  const folders = discoverSkillFolders(packagePath);
  console.log(`Discovered ${folders.length} skill folders: ${folders.join(', ')}`);

  const skills: Record<string, string> = {};
  const metadata: SkillMetadata[] = [];

  for (const folder of folders) {
    const skill = readSkill(packagePath, folder);
    if (skill) {
      skills[folder] = skill.content;
      metadata.push(skill.metadata);
      console.log(`  Embedded: ${skill.metadata.commandName} (${folder})`);
    }
  }

  // Also embed local skills from src/lib/skills
  console.log('\nEmbedding local skills from src/lib/skills...');
  const localFolders = discoverLocalSkillFolders();
  if (localFolders.length > 0) {
    console.log(
      `Discovered ${localFolders.length} local skill folders: ${localFolders.join(', ')}`,
    );
    for (const folder of localFolders) {
      const localSkill = readLocalSkill(folder);
      if (localSkill) {
        // Prefix local skills with 'local-' to avoid name conflicts
        skills[`local-${folder}`] = localSkill.content;
        console.log(`  Embedded: ${folder} (local)`);
      }
    }
  }

  if (Object.keys(skills).length === 0) {
    console.error('ERROR: No skills were embedded.');
    process.exit(1);
  }

  const fileContent = generateEmbeddedSkillsFile(skills, metadata);
  writeFileSync(OUTPUT_FILE, fileContent);
  console.log(`\nCreated: ${OUTPUT_FILE}`);
  console.log(
    `Embedded ${Object.keys(skills).length} skills (${metadata.length} package + ${localFolders.length} local).`,
  );
}

main().catch((error) => {
  console.error('Error embedding skills:', error);
  process.exit(1);
});
