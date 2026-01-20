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
 * Create a skill command from metadata.
 */
function createSkillCommand(meta: SkillMetadata): Command {
  return {
    type: 'local',
    name: meta.commandName,
    description: meta.shortDescription || meta.displayName,
    isEnabled: true,
    isHidden: false,

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
    isHidden: false,
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
  commands.push(createLocalSkillCommand('diagnose', 'Diagnose SDK integration status', 'diagnose'));

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
export const diagnoseCommand = skillCommands.find((c) => c.name === 'diagnose');
