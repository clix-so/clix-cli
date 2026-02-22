import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PreparationContext } from '@/commands/skill/preparation';
import { getEmbeddedSkill, hasEmbeddedSkills } from './embedded-skills';
import type { AgentExecutor, AgentMessage } from './executor';
import { formatProjectType } from './services/project-detector';

export type SkillType = string;

export interface SkillOptions {
  projectPath?: string;
  signal?: AbortSignal;
  oneShot?: boolean;
  preparationContext?: PreparationContext;
}

export interface SkillInfo {
  type: SkillType;
  name: string;
  description: string;
  isLocal?: boolean;
  usesAgent?: boolean;
  visibility?: 'public' | 'internal';
}

const LOCAL_SKILLS: SkillInfo[] = [
  {
    type: 'install',
    name: 'SDK Installation',
    description: 'Autonomous SDK integration with automatic file modifications',
    isLocal: true,
    visibility: 'public',
  },
  {
    type: 'doctor',
    name: 'SDK Doctor',
    description: 'Check Clix SDK integration status',
    isLocal: true,
    visibility: 'public',
  },
];

export function getAvailableSkills(): SkillInfo[] {
  return LOCAL_SKILLS;
}

export const AVAILABLE_SKILLS: SkillInfo[] = getAvailableSkills();

export function getAvailableSkillTypes(): string[] {
  return getAvailableSkills().map((s) => s.type);
}

export function isValidSkillType(type: string): boolean {
  return getAvailableSkillTypes().includes(type);
}

export function getSkillInfo(type: SkillType): SkillInfo | undefined {
  return getAvailableSkills().find((skill) => skill.type === type);
}

function isLocalSkill(skillType: SkillType): boolean {
  return getAvailableSkills().some((skill) => skill.type === skillType && skill.isLocal);
}

const ONE_SHOT_INSTRUCTION = `
IMPORTANT: This is a non-interactive one-shot execution with FULL file modification permissions.

EXECUTION GUIDELINES:
- You have FULL permission to create, modify, and delete files autonomously
- DO NOT ask for user input, confirmation, or permission
- Make reasonable assumptions based on project structure and pre-configured setup context
- PROCEED WITH FILE CHANGES directly; do not only provide instructions
- Run required commands for dependency resolution and verification
- If blocked by external constraints (credentials, permissions, unavailable services), report the blocker clearly
`;

function readLocalSkillPrompt(skillName: string): string {
  if (hasEmbeddedSkills()) {
    const embeddedSkill = getEmbeddedSkill(`local-${skillName}`);
    if (embeddedSkill) {
      return embeddedSkill;
    }
  }

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

function formatProjectPublicApiKey(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'key' in value) {
    const keyValue = (value as { key: unknown }).key;
    if (typeof keyValue === 'string' && keyValue.length > 0) {
      return keyValue;
    }
  }

  return 'not configured';
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

interface PreparationSectionOptions {
  verificationTitle?: string;
  footerLines?: string[];
}

function buildPreparationSection(
  context: PreparationContext,
  options?: PreparationSectionOptions,
): string {
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
  appendOptionalSection(lines, options?.verificationTitle ?? 'Setup Verification', [
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
      context.firebase.senderConfigConfigured &&
        context.firebase.senderConfigProjectMatched !== false,
    )}`,
    `iOS Entitlements: ${formatSetupStepStatus(context.ios.needed, context.ios.entitlementsConfigured)}`,
    `Notification Service Extension: ${formatSetupStepStatus(
      context.ios.needed,
      context.ios.nseConfigured,
    )}`,
  ]);

  appendOptionalSection(lines, 'Clix Project', [
    `Project ID: ${context.config.project.id}`,
    `Project Public API Key: ${formatProjectPublicApiKey(
      context.config.project.public_api_key ?? context.config.project.publicKey,
    )}`,
  ]);

  appendOptionalSection(
    lines,
    'Firebase',
    [
      `Project ID: ${context.firebase.projectId || 'not configured'}`,
      `Android (google-services.json): ${context.firebase.androidConfigured ? '✓ configured' : '✗ missing'}`,
      `iOS (GoogleService-Info.plist): ${context.firebase.iosConfigured ? '✓ configured' : '✗ missing'}`,
      `Sender Config (App Push): ${
        context.firebase.senderConfigConfigured
          ? context.firebase.senderConfigProjectMatched === false
            ? '✗ project mismatch'
            : '✓ configured'
          : '✗ missing'
      }`,
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

  const footer = options?.footerLines ?? [
    'This context was pre-verified by clix before agent handoff.',
    'Use these values as ground truth for your analysis.',
  ];
  for (const line of footer) {
    lines.push(line);
  }
  lines.push('');

  return lines.join('\n');
}

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
  const platform = inferredPlatform ?? 'auto-detect';

  let prompt = `Project path: ${projectPath}\nTarget platform: ${platform}\n`;
  if (context) {
    prompt += `Detected project type: ${formatProjectType(context.projectType)}\n`;
  }
  prompt += '\n';

  if (context) {
    prompt += buildPreparationSection(context, {
      verificationTitle: 'Install Step Verification',
      footerLines: [
        'Treat the above as already executed/validated by clix install preparation.',
        'Use these pre-configured values when running build and troubleshooting failures.',
      ],
    });
    prompt += '\n';
  }

  prompt +=
    'Execution goal: Complete SDK integration workflow using the pre-configured setup context.\n';
  prompt += 'Use build commands for verification after integration changes.\n\n';

  if (options?.oneShot) {
    prompt += `${ONE_SHOT_INSTRUCTION}\n\n`;
  }

  prompt += readLocalSkillPrompt('install');
  return prompt;
}

function getDoctorPrompt(options?: SkillOptions): string {
  const projectPath = options?.projectPath ?? process.cwd();
  const context = options?.preparationContext;

  let prompt = `Project path: ${projectPath}\n`;
  if (context) {
    prompt += `Detected project type: ${formatProjectType(context.projectType)}\n`;
  }
  prompt += '\n';

  if (context) {
    prompt += buildPreparationSection(context, {
      verificationTitle: 'Pre-verified Status',
      footerLines: [
        'This context was pre-verified by clix before agent handoff.',
        'Use these values as ground truth. Do not re-scan for information already provided above.',
        'Focus your analysis on SDK integration issues, version checks, and actionable recommendations.',
      ],
    });
    prompt += '\n';
  }

  if (options?.oneShot) {
    prompt += `${ONE_SHOT_INSTRUCTION}\n\n`;
  }

  prompt += readLocalSkillPrompt('doctor');
  return prompt;
}

async function getLocalSkillPrompt(skillType: SkillType, options?: SkillOptions): Promise<string> {
  switch (skillType) {
    case 'install':
      return getInstallPrompt(options);
    case 'doctor':
      return getDoctorPrompt(options);
    default:
      throw new Error(`Unknown local skill: ${skillType}`);
  }
}

export async function getSkillPrompt(
  skillType: SkillType,
  options?: SkillOptions,
): Promise<string> {
  if (!isLocalSkill(skillType)) {
    throw new Error(`Unknown command type: ${skillType}`);
  }

  return await getLocalSkillPrompt(skillType, options);
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
  })) {
    yield message;
  }
}
