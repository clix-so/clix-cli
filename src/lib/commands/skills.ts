/**
 * Skill commands - dynamically generated from embedded skills.
 *
 * Commands are generated at runtime from @clix-so/clix-agent-skills metadata,
 * allowing new skills to be added without modifying this file.
 *
 * @module commands/skills
 */

import { EMBEDDED_SKILL_METADATA, type SkillMetadata } from '../embedded-skills';
import type { SkillType } from '../skills';
import type { Command } from './types';

/**
 * Package skills to hide from the slash command menu.
 * These are still accessible by typing the full command directly.
 * Hidden because they overlap with /install or are advanced features not needed for initial setup.
 */
const HIDDEN_PACKAGE_SKILLS = new Set([
  'integration', // Overlaps with /install
  'event-tracking', // Advanced, not needed for initial install
  'user-management', // Advanced, not needed for initial install
  'personalization', // Campaign feature, advanced
  'api-triggered-campaigns', // Backend feature, advanced
]);

/**
 * Local skills to hide from the slash command menu.
 * These are still accessible by typing the full command directly.
 */
const HIDDEN_LOCAL_SKILLS = new Set([
  'ios-setup', // Sub-skill invoked by /install
]);

/**
 * Create a skill command from metadata.
 */
function createSkillCommand(meta: SkillMetadata): Command {
  return {
    type: 'local',
    name: meta.commandName,
    description: meta.shortDescription || meta.displayName,
    isEnabled: true,
    isHidden: HIDDEN_PACKAGE_SKILLS.has(meta.commandName),

    userFacingName() {
      return `/${meta.commandName}`;
    },

    async call() {
      // The actual skill execution is handled by the command handler
      // This just signals which skill to execute
      return { success: true, message: meta.commandName as SkillType };
    },
  };
}

/**
 * Create a local skill command (not from package).
 */
function createLocalSkillCommand(
  name: string,
  displayName: string,
  skillType: SkillType,
  aliases?: string[],
): Command {
  return {
    type: 'local',
    name,
    description: displayName,
    isEnabled: true,
    isHidden: HIDDEN_LOCAL_SKILLS.has(name),
    aliases,

    userFacingName() {
      return `/${name}`;
    },

    async call() {
      return { success: true, message: skillType };
    },
  };
}

/**
 * Generate skill commands from embedded metadata.
 */
function generateSkillCommands(): Command[] {
  const commands: Command[] = [];

  // Generate commands from embedded skill metadata
  for (const meta of EMBEDDED_SKILL_METADATA) {
    commands.push(createSkillCommand(meta));
  }

  // Add local skills (not from package)
  commands.push(
    createLocalSkillCommand(
      'install',
      'Autonomous SDK installation with file modifications',
      'install',
    ),
  );
  commands.push(createLocalSkillCommand('doctor', 'Check SDK integration status', 'doctor'));
  commands.push(
    createLocalSkillCommand(
      'ios-setup',
      'Configure iOS capabilities for push notifications and app groups',
      'ios-setup',
      ['capabilities', 'ios-capabilities'],
    ),
  );

  return commands;
}

/**
 * All skill commands - dynamically generated from embedded skills.
 */
export const skillCommands: Command[] = generateSkillCommands();

/**
 * Get a skill command by name.
 */
export function getSkillCommand(name: string): Command | undefined {
  return skillCommands.find((cmd) => cmd.name === name);
}

/**
 * Check if a command name is a skill command.
 */
export function isSkillCommand(name: string): boolean {
  return getSkillCommand(name) !== undefined;
}

// Export individual commands for backward compatibility
export const integrationCommand = skillCommands.find((c) => c.name === 'integration');
export const eventTrackingCommand = skillCommands.find((c) => c.name === 'event-tracking');
export const userManagementCommand = skillCommands.find((c) => c.name === 'user-management');
export const personalizationCommand = skillCommands.find((c) => c.name === 'personalization');
export const apiTriggeredCampaignsCommand = skillCommands.find(
  (c) => c.name === 'api-triggered-campaigns',
);
export const doctorCommand = skillCommands.find((c) => c.name === 'doctor');
