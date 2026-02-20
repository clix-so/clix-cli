import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { PreparationContext } from '@/commands/skill/preparation';
import {
  EMBEDDED_SKILL_METADATA,
  getEmbeddedSkill,
  getSkillMetadataByCommand,
  hasEmbeddedSkills,
  type SkillMetadata,
} from './embedded-skills';
import type { AgentExecutor, AgentMessage } from './executor';
import { getDebugPrompt } from './services/debug-service';
import { formatProjectType } from './services/project-detector';

/**
 * Skill type - dynamically generated from embedded skills + local skills.
 * Use getAvailableSkillTypes() for runtime access.
 */
export type SkillType = string;

export interface SkillOptions {
  projectPath?: string;
  platform?: 'ios' | 'android' | 'react-native' | 'flutter';
  signal?: AbortSignal;
  /** One-shot mode: disable session persistence (for command-line execution) */
  oneShot?: boolean;
  /** Preparation context from install preparation phase */
  preparationContext?: PreparationContext;
}

export interface SkillInfo {
  type: SkillType;
  name: string;
  description: string;
  /** Whether this is a local skill (not from @clix-so/clix-agent-skills) */
  isLocal?: boolean;
  /** Whether this skill uses an AI agent (default: true). Set to false for direct implementation. */
  usesAgent?: boolean;
  /** Visibility in user-facing command lists/help. */
  visibility?: 'public' | 'internal';
}

/**
 * Local skills that are not provided by @clix-so/clix-agent-skills.
 * These are implemented directly in this file.
 */
const LOCAL_SKILLS: SkillInfo[] = [
  {
    type: 'install',
    name: 'SDK Installation',
    description: 'Autonomous SDK integration with automatic file modifications',
    isLocal: true,
  },
  {
    type: 'project-build',
    name: 'Project Build',
    description: 'Autonomous project build with automatic diagnostics and fixes',
    isLocal: true,
    visibility: 'internal',
  },
  {
    type: 'doctor',
    name: 'SDK Doctor',
    description: 'Check Clix SDK integration status',
    isLocal: true,
  },
  {
    type: 'debug',
    name: 'Debug Assistant',
    description: 'Interactive debugging assistant',
    isLocal: true,
  },
];

/**
 * Get all skills including internal-only skills.
 */
function getAllSkills(): SkillInfo[] {
  const embeddedSkills: SkillInfo[] = EMBEDDED_SKILL_METADATA.map((meta) => ({
    type: meta.commandName,
    name: meta.displayName,
    description: meta.shortDescription || meta.displayName,
    isLocal: false,
    visibility: 'public',
  }));

  return [...embeddedSkills, ...LOCAL_SKILLS];
}

/**
 * Get user-facing skills (from embedded metadata + public local skills).
 */
export function getAvailableSkills(): SkillInfo[] {
  return getAllSkills().filter((skill) => skill.visibility !== 'internal');
}

/**
 * Available skills - for backward compatibility.
 * Prefer using getAvailableSkills() for dynamic access.
 */
export const AVAILABLE_SKILLS: SkillInfo[] = getAvailableSkills();

/**
 * Get all available skill types (command names).
 */
export function getAvailableSkillTypes(): string[] {
  return getAvailableSkills().map((s) => s.type);
}

/**
 * Check if a skill type is valid.
 */
export function isValidSkillType(type: string): boolean {
  return getAvailableSkillTypes().includes(type);
}

export function getSkillInfo(type: SkillType): SkillInfo | undefined {
  return getAllSkills().find((skill) => skill.type === type);
}

/**
 * Get skill metadata by command name.
 */
function getSkillFolderByCommand(commandName: string): string | null {
  const meta = getSkillMetadataByCommand(commandName);
  return meta?.folder ?? null;
}

/**
 * Check if a skill is a local skill (not from package).
 */
function isLocalSkill(skillType: SkillType): boolean {
  return getAllSkills().some((skill) => skill.type === skillType && skill.isLocal);
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

function readSkillMarkdown(skillFolder: string): string {
  // Try external package first (for development)
  const packagePath = getSkillsPackagePath();
  if (packagePath) {
    try {
      const skillPath = join(packagePath, 'skills', skillFolder, 'SKILL.md');
      return readFileSync(skillPath, 'utf-8');
    } catch {
      // Fall through to embedded skills
    }
  }

  // Fall back to embedded skills (for bundled binary)
  if (hasEmbeddedSkills()) {
    const embeddedSkill = getEmbeddedSkill(skillFolder);
    if (embeddedSkill) {
      return embeddedSkill;
    }
  }

  // No skills available
  throw new Error(
    `Skill "${skillFolder}" not found. Skills package not installed and no embedded skills available.`,
  );
}

/**
 * One-shot mode instruction with explicit file modification permissions.
 * Instructs the agent to actually make changes rather than providing manual steps.
 */
const ONE_SHOT_INSTRUCTION = `
IMPORTANT: This is a non-interactive one-shot execution with FULL file modification permissions.

EXECUTION GUIDELINES:
- You have FULL permission to create, modify, and delete files autonomously
- DO NOT ask for user input, confirmation, or permission
- Make reasonable assumptions based on the project structure
- Choose the most common/recommended approach when multiple options exist
- PROCEED WITH ALL NECESSARY FILE CHANGES without waiting for user response
- If critical information is missing, state your assumptions and proceed with changes

FILE OPERATIONS:
- Create new files as needed for the integration
- Modify existing configuration files
- Update source code files with initialization code
- Add environment variables to config files
- DO NOT just provide instructions - ACTUALLY MAKE THE CHANGES

COMPLETION CRITERIA:
- All necessary files must be created or modified
- Integration must be fully functional without manual intervention
- Provide a summary of changes made (not what needs to be done manually)
`;

/**
 * Interactive mode instruction for Guided Interactive Workflow.
 * Instructs the agent to follow the Confirm → Propose → Validate → Implement → Verify pattern.
 */
const INTERACTIVE_MODE_INSTRUCTION = `
IMPORTANT: This is an interactive conversation session. Follow the Guided Interactive Workflow.

EXECUTION GUIDELINES:
- ALWAYS follow the workflow steps in order: Confirm → Propose → Validate → Implement → Verify
- DO NOT skip to implementation without completing earlier steps
- ASK for required inputs before proceeding (platform, goals, preferences)
- PROPOSE your plan and wait for user approval before making changes
- NEVER modify files without explicit user confirmation
- If information is missing, ASK the user rather than assuming

WORKFLOW ENFORCEMENT:
- Start by confirming the minimum required inputs from the user
- Present your proposed plan for review
- Only proceed to implementation after the user approves the plan
- Validate before implementing, verify after implementing
`;

/**
 * Read a local skill prompt from the skills directory.
 * Local skill prompts are stored in src/lib/skills/<skill-name>/SKILL.md
 * For bundled builds, prompts are embedded at build time.
 */
function readLocalSkillPrompt(skillName: string): string {
  // Try embedded skills first (for bundled binary)
  if (hasEmbeddedSkills()) {
    const embeddedSkill = getEmbeddedSkill(`local-${skillName}`);
    if (embeddedSkill) {
      return embeddedSkill;
    }
  }

  // Fall back to reading from file system (for development)
  try {
    const skillPath = join(
      dirname(import.meta.url.replace('file://', '')),
      'skills',
      skillName,
      'SKILL.md',
    );
    return readFileSync(skillPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read local skill prompt for "${skillName}": ${error}`);
  }
}

function formatSetupStepStatus(required: boolean, configured: boolean): string {
  if (!required) {
    return '- not required';
  }
  return configured ? '✓ verified' : '✗ missing';
}

function appendOptionalSection(
  lines: string[],
  title: string,
  rows: string[],
  enabled: boolean = true,
): void {
  if (!enabled) {
    return;
  }

  lines.push(`### ${title}`);
  for (const row of rows) {
    lines.push(`- ${row}`);
  }
  lines.push('');
}

/**
 * Build pre-configured setup section from preparation context.
 */
function buildPreparationSection(context: PreparationContext): string {
  const lines: string[] = ['## Pre-configured Setup', ''];
  lines.push(`Project: ${context.config.project.name}`);
  lines.push(`Type: ${formatProjectType(context.projectType)}`);
  lines.push('');

  const iosTarget =
    context.projectType.target === 'ios' || context.projectType.target === 'ios-android';
  const androidTarget =
    context.projectType.target === 'android' || context.projectType.target === 'ios-android';
  const firebaseFilesConfigured =
    !context.firebase.needed ||
    ((!iosTarget || context.firebase.iosConfigured) &&
      (!androidTarget || context.firebase.androidConfigured));
  appendOptionalSection(lines, 'Install Step Verification', [
    'Project linked: ✓ verified',
    `Firebase Configuration Files: ${formatSetupStepStatus(
      context.firebase.needed,
      firebaseFilesConfigured,
    )}`,
    `APNS Key for Firebase: ${formatSetupStepStatus(
      context.apns.needed,
      context.apns.registeredWithFirebase,
    )}`,
    `Firebase Service Account: ${formatSetupStepStatus(
      context.firebase.needed,
      context.firebase.senderConfigConfigured,
    )}`,
    `iOS Entitlements: ${formatSetupStepStatus(context.ios.needed, context.ios.entitlementsConfigured)}`,
    `Notification Service Extension: ${formatSetupStepStatus(
      context.ios.needed,
      context.ios.nseConfigured,
    )}`,
  ]);

  appendOptionalSection(lines, 'Clix Project', [
    `Project ID: ${context.config.project.id}`,
    ...(context.config.project.publicKey
      ? [`Public Key: ${context.config.project.publicKey}`]
      : []),
  ]);

  appendOptionalSection(
    lines,
    'Firebase',
    [
      `Project ID: ${context.firebase.projectId || 'not configured'}`,
      `Android (google-services.json): ${context.firebase.androidConfigured ? '✓ configured' : '✗ missing'}`,
      `iOS (GoogleService-Info.plist): ${context.firebase.iosConfigured ? '✓ configured' : '✗ missing'}`,
      `Sender Config (App Push): ${context.firebase.senderConfigConfigured ? '✓ configured' : '✗ missing'}`,
    ],
    context.firebase.needed,
  );

  appendOptionalSection(
    lines,
    'APNS',
    [
      `Key ID: ${context.apns.keyId || 'not configured'}`,
      `Team ID: ${context.apns.teamId || 'not configured'}`,
      `Registered with Firebase: ${context.apns.registeredWithFirebase ? '✓ configured' : '✗ missing'}`,
    ],
    context.apns.needed,
  );

  appendOptionalSection(
    lines,
    'iOS',
    [
      `Bundle ID: ${context.ios.bundleId || 'not detected'}`,
      `Team ID: ${context.ios.teamId || 'not detected'}`,
      `App Group: ${context.ios.appGroupId || 'not configured'}`,
      `Entitlements: ${context.ios.entitlementsConfigured ? '✓ configured' : '✗ not configured'}`,
      `NSE (Notification Service Extension): ${context.ios.nseConfigured ? '✓ configured' : '✗ not configured'}`,
    ],
    context.ios.needed,
  );

  appendOptionalSection(
    lines,
    'Missing Setup (handle before build)',
    context.missing,
    context.missing.length > 0,
  );

  lines.push('Treat the above as already executed/validated by /install.');
  lines.push('Use these pre-configured values when running build and troubleshooting failures.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get prompt for the install skill.
 * Uses the SDK integration workflow prompt.
 * Prompt is loaded from src/lib/skills/install/SKILL.md
 */
function getInstallPrompt(options?: SkillOptions): string {
  const projectPath = options?.projectPath ?? process.cwd();
  const context = options?.preparationContext;
  const inferredPlatform =
    context?.projectType.framework === 'flutter'
      ? 'flutter'
      : context?.projectType.framework === 'react-native' ||
          context?.projectType.framework === 'expo'
        ? 'react-native'
        : context?.projectType.framework === 'native'
          ? context.projectType.target === 'ios'
            ? 'ios'
            : context.projectType.target === 'android'
              ? 'android'
              : undefined
          : undefined;
  const platform = options?.platform ?? inferredPlatform ?? 'auto-detect';

  let prompt = `Project path: ${projectPath}\nTarget platform: ${platform}\n`;
  if (context) {
    prompt += `Detected project type: ${formatProjectType(context.projectType)}\n`;
  }
  prompt += '\n';

  // Add preparation context if available
  if (context) {
    prompt += buildPreparationSection(context);
    prompt += '\n';
  }

  // Add one-shot instruction for autonomous execution
  if (options?.oneShot) {
    prompt += `${ONE_SHOT_INSTRUCTION}\n\n`;

    // Add explicit directive for autonomous execution
    prompt += `## EXECUTION MODE: AUTONOMOUS

You are in autonomous one-shot execution mode:
- ALL file operations are pre-approved
- Use Write/Edit/Bash tools immediately without asking
- Complete all integration steps automatically
- Report what was done, not what should be done

`;
  }
  const installPrompt = readLocalSkillPrompt('install');
  prompt += installPrompt;

  return prompt;
}

/**
 * Get prompt for the project-build skill.
 * Prompt is loaded from src/lib/skills/project-build/SKILL.md
 */
function getProjectBuildPrompt(options?: SkillOptions): string {
  const projectPath = options?.projectPath ?? process.cwd();
  const context = options?.preparationContext;
  const inferredPlatform =
    context?.projectType.framework === 'flutter'
      ? 'flutter'
      : context?.projectType.framework === 'react-native' ||
          context?.projectType.framework === 'expo'
        ? 'react-native'
        : context?.projectType.framework === 'native'
          ? context.projectType.target === 'ios'
            ? 'ios'
            : context.projectType.target === 'android'
              ? 'android'
              : undefined
          : undefined;
  const platform = options?.platform ?? inferredPlatform ?? 'auto-detect';

  let prompt = `Project path: ${projectPath}\nTarget platform: ${platform}\n`;
  if (context) {
    prompt += `Detected project type: ${formatProjectType(context.projectType)}\n`;
  }
  prompt += '\n';

  if (context) {
    prompt += buildPreparationSection(context);
    prompt += '\n';
  }

  if (options?.oneShot) {
    prompt += `${ONE_SHOT_INSTRUCTION}\n\n`;
    prompt += `## EXECUTION MODE: AUTONOMOUS

You are in autonomous one-shot execution mode:
- ALL file operations are pre-approved
- Use Write/Edit/Bash tools immediately without asking
- Complete all integration steps automatically
- Report what was done, not what should be done

`;
  }

  const projectBuildPrompt = readLocalSkillPrompt('project-build');
  prompt += projectBuildPrompt;
  return prompt;
}

export async function getSkillPrompt(
  skillType: SkillType,
  options?: SkillOptions,
): Promise<string> {
  // Handle local skills
  if (isLocalSkill(skillType)) {
    return await getLocalSkillPrompt(skillType, options);
  }

  // Get folder name from metadata
  const skillFolder = getSkillFolderByCommand(skillType);
  if (!skillFolder) {
    throw new Error(`Unknown skill type: ${skillType}`);
  }

  // Read SKILL.md from @clix-so/clix-agent-skills package
  const skillMarkdown = readSkillMarkdown(skillFolder);

  const projectPath = options?.projectPath ?? process.cwd();
  const platform = options?.platform ?? 'auto-detect';

  // Build prompt with context
  let prompt = `Project path: ${projectPath}
Target platform: ${platform}
`;

  // Add mode-specific instruction
  if (options?.oneShot) {
    prompt += ONE_SHOT_INSTRUCTION;
  } else {
    prompt += INTERACTIVE_MODE_INSTRUCTION;
  }

  prompt += `\n${skillMarkdown}`;

  return prompt;
}

/**
 * Get prompt for local skills.
 */
async function getLocalSkillPrompt(skillType: SkillType, options?: SkillOptions): Promise<string> {
  switch (skillType) {
    case 'install':
      return getInstallPrompt(options);
    case 'project-build':
      return getProjectBuildPrompt(options);
    case 'doctor':
      return getDoctorPrompt(options);
    case 'debug':
      return getDebugPrompt({
        problemDescription: 'General debugging session',
        projectPath: options?.projectPath ?? process.cwd(),
        oneShot: options?.oneShot,
      });
    default:
      throw new Error(`Unknown local skill: ${skillType}`);
  }
}

/**
 * Get prompt for the doctor skill.
 * Uses the doctor prompt for SDK integration status analysis.
 * Prompt is loaded from src/lib/skills/doctor/SKILL.md
 */
function getDoctorPrompt(options?: SkillOptions): string {
  const projectPath = options?.projectPath ?? process.cwd();

  let prompt = `Project path: ${projectPath}\n\n`;

  // Add one-shot instruction for autonomous execution
  if (options?.oneShot) {
    prompt += `${ONE_SHOT_INSTRUCTION}\n\n`;
  }

  // Load the doctor prompt from external file
  const doctorPrompt = readLocalSkillPrompt('doctor');
  prompt += doctorPrompt;

  return prompt;
}

export async function* executeSkill(
  skillType: SkillType,
  executor: AgentExecutor,
  options?: SkillOptions,
): AsyncGenerator<AgentMessage> {
  const prompt = await getSkillPrompt(skillType, options);

  for await (const message of executor.execute(prompt, {
    workingDirectory: options?.projectPath,
    signal: options?.signal,
    oneShot: options?.oneShot,
  })) {
    yield message;
  }
}

/**
 * Re-export embedded skill metadata for use in commands.
 */
export { EMBEDDED_SKILL_METADATA, type SkillMetadata };
